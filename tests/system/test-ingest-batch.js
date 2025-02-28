// @ts-nocheck

import test from 'ava'
import nock from 'nock'
import { randomUUID } from 'crypto'
import { getCollectionIds, getItem } from '../helpers/api.js'
import { handler } from '../../src/lambdas/ingest/index.js'
import { loadFixture, randomId } from '../helpers/utils.js'
import { refreshIndices, deleteAllIndices } from '../helpers/database.js'
import { sqsTriggerLambda, purgeQueue } from '../helpers/sqs.js'
import { sns, s3 as _s3, sqs as _sqs } from '../../src/lib/aws-clients.js'
import { setup } from '../helpers/system-tests.js'
import { ingestItemC, ingestFixtureC } from '../helpers/ingest.js'

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await setup()

  t.context = standUpResult

  t.context.ingestItem = ingestItemC(
    standUpResult.ingestTopicArn,
    standUpResult.ingestQueueUrl
  )
  t.context.ingestFixture = ingestFixtureC(
    standUpResult.ingestTopicArn,
    standUpResult.ingestQueueUrl
  )
})

test.beforeEach(async (t) => {
  const { ingestQueueUrl, ingestTopicArn, eventBridgeQueueUrl } = t.context

  if (ingestQueueUrl === undefined) throw new Error('No ingest queue url')
  if (ingestTopicArn === undefined) throw new Error('No ingest topic ARN')

  process.env['POST_INGEST_EVENT_BUS_NAME'] = 'default'
  await purgeQueue(ingestQueueUrl)
  await purgeQueue(eventBridgeQueueUrl)
})

test.afterEach.always(() => {
  nock.cleanAll()
})

const ingestItems = async (t, filepaths) => {
  const { ingestQueueUrl, ingestTopicArn } = t.context

  const s3 = _s3()

  const sourceBucket = randomId('bucket')
  await s3.createBucket({
    Bucket: sourceBucket,
    CreateBucketConfiguration: {
      LocationConstraint: 'us-west-2'
    }
  })

  const orderId = randomUUID()
  const collectionId = randomId('collection')

  const promises = filepaths.map(async (path, index) => {
    const fixtureParams = {
      id: index === 0 ? collectionId : randomId('item'),
      collection: index === 0 ? undefined : collectionId,
    }
    const fixture = await loadFixture(path, fixtureParams)

    await s3.putObject({
      Bucket: sourceBucket,
      Key: fixture.id,
      Body: JSON.stringify(fixture)
    })

    return fixture.id
  })

  const keys = await Promise.all(promises)

  await sns().publish({
    TopicArn: ingestTopicArn,
    Message: JSON.stringify({
      order_id: orderId,
      items: keys.map((key) => `s3://${sourceBucket}/${key}`)
    })
  })

  await sqsTriggerLambda(ingestQueueUrl, handler)
  await refreshIndices()

  return {
    orderId,
    keys: keys
  }
}

test('The ingest lambda supports ingesting a batch of items in order', async (t) => {
  const { keys } = await ingestItems(t, [
    'landsat-8-l1-collection.json',
    'stac/LC80100102015050LGN00.json',
    'stac/LC80100102015082LGN00.json',
  ])

  const [collectionKey, item1Key, item2Key] = keys

  const collectionIds = await getCollectionIds(t.context.api.client)
  t.true(collectionIds.includes(collectionKey))

  const fetchedItem1 = await getItem(t.context.api.client, collectionKey, item1Key)
  const fetchedItem2 = await getItem(t.context.api.client, collectionKey, item2Key)

  t.true(fetchedItem2.properties.created > fetchedItem1.properties.created)
})

test('Should publish SUCCESS event after ingesting order', async (t) => {
  const { orderId } = await ingestItems(t, [
    'landsat-8-l1-collection.json',
    'stac/LC80100102015050LGN00.json',
    'stac/LC80100102015082LGN00.json',
  ])

  const { Messages } = await _sqs().receiveMessage({
    QueueUrl: t.context.eventBridgeQueueUrl,
    WaitTimeSeconds: 2
  })

  t.truthy(Messages, 'Post-ingest message not found in queue')
  t.false(Messages && Messages.length > 1, 'More than one message in post-ingest queue')

  // Test will fail in case Messages[0] or Body is undefined.
  const messageBody = JSON.parse(Messages[0].Body)

  // Verify event parameters
  t.is(messageBody['detail-type'], 'StacIngestCompleted')
  t.is(messageBody['source'], 'stac.ingest.lambda')
  t.deepEqual(messageBody['resources'], [])

  // Verify event data
  t.truthy(messageBody.detail)
  const { orderId: actualOrderId, status: actualStatus } = messageBody.detail
  t.is(actualOrderId, orderId, 'Received incorrect orderID')
  t.is(actualStatus, 'SUCCESS', 'Received incorrect status')
})
