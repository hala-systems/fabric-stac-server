// @ts-nocheck

import test from 'ava'
import nock from 'nock'
import { DateTime } from 'luxon'
import { getCollectionIds, getItem } from '../helpers/api.js'
import { handler } from '../../src/lambdas/ingest/index.js'
import { loadFixture, randomId } from '../helpers/utils.js'
import { refreshIndices, deleteAllIndices } from '../helpers/database.js'
import { sqsTriggerLambda, purgeQueue } from '../helpers/sqs.js'
import { sns, s3 as _s3 } from '../../src/lib/aws-clients.js'
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
  const { ingestQueueUrl, ingestTopicArn } = t.context

  if (ingestQueueUrl === undefined) throw new Error('No ingest queue url')
  if (ingestTopicArn === undefined) throw new Error('No ingest topic ARN')

  await purgeQueue(ingestQueueUrl)
})

test.afterEach.always(() => {
  nock.cleanAll()
})

test('The ingest lambda supports ingesting a batch of items in order', async (t) => {
  const { ingestQueueUrl, ingestTopicArn } = t.context

  const s3 = _s3()

  // Load the collection to be ingested
  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )
  const itemFilepaths = [
    'stac/LC80100102015050LGN00.json',
    'stac/LC80100102015082LGN00.json',
  ]
  const [item1, item2] = await Promise.all(
    itemFilepaths.map((path, index) => loadFixture(
      path,
      {
        id: randomId(`item-${index + 1}`),
        collection: collection.id
      }
    ))
  )
  const [itemKey1, itemKey2] = [randomId('key-1'), randomId('key-2')]

  // Create the S3 bucket to source the collection from
  const sourceBucket = randomId('bucket')
  const collectionKey = randomId('key')

  await s3.createBucket({
    Bucket: sourceBucket,
    CreateBucketConfiguration: {
      LocationConstraint: 'us-west-2'
    }
  })

  await s3.putObject({
    Bucket: sourceBucket,
    Key: collectionKey,
    Body: JSON.stringify(collection)
  })

  await s3.putObject({
    Bucket: sourceBucket,
    Key: itemKey1,
    Body: JSON.stringify(item1)
  })

  await s3.putObject({
    Bucket: sourceBucket,
    Key: itemKey2,
    Body: JSON.stringify(item2)
  })

  await sns().publish({
    TopicArn: ingestTopicArn,
    Message: JSON.stringify({
      items: [
        `s3://${sourceBucket}/${collectionKey}`,
        `s3://${sourceBucket}/${itemKey1}`,
        `s3://${sourceBucket}/${itemKey2}`
      ]
    })
  })

  await sqsTriggerLambda(ingestQueueUrl, handler)

  await refreshIndices()

  const collectionIds = await getCollectionIds(t.context.api.client)
  t.true(collectionIds.includes(collection.id))

  const fetchedItem1 = await getItem(t.context.api.client, collection.id, item1.id)
  const fetchedItem2 = await getItem(t.context.api.client, collection.id, item2.id)

  t.true(fetchedItem2.properties.created > fetchedItem1.properties.created)
})
