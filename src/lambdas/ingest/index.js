/* eslint-disable import/prefer-default-export */
import got from 'got' // eslint-disable-line import/no-unresolved
// import { PutEventsCommand } from '@aws-sdk/client-eventbridge'
import { createIndex } from '../../lib/database-client.js'
import { ingestItems, publishResultsToEventBridge, publishResultsToSns } from '../../lib/ingest.js'
import getObjectJson from '../../lib/s3-utils.js'
import logger from '../../lib/logger.js'

const isSqsEvent = (event) => 'Records' in event

const isSnsMessage = (record) => record.Type === 'Notification'

const stacItemFromURL = async (url) => {
  const { protocol, hostname, pathname } = new URL(url)

  if (protocol === 's3:') {
    return getObjectJson({
      bucket: hostname,
      key: pathname.replace(/^\//, '')
    })
  }

  if (protocol.startsWith('http')) {
    return got.get(url, {
      resolveBodyOnly: true
    }).json()
  }

  throw new Error(`Unsupported source: ${url}`)
}

const stacItemsFromSnsMessage = async (message) => {
  // If the SNS message contains an array of items
  if ('items' in message) {
    return Promise.all(message.items.map((itemUrl) => stacItemFromURL(itemUrl)))
  }

  // If the SNS message contains only one item
  if ('href' in message) {
    return stacItemFromURL(message.href)
  }

  return message
}

const stacItemsFromRecord = async (record) => {
  const recordBody = JSON.parse(record.body)

  return isSnsMessage(recordBody)
    ? await stacItemsFromSnsMessage(JSON.parse(recordBody.Message))
    : recordBody
}

const stacItemsFromSqsEvent = async (event) => {
  const records = event.Records

  return (await Promise.all(
    records.map((r) => stacItemsFromRecord(r))
  )).flat()
}

/**
 * The result for ingesting an order.
 * @typedef {Object} OrderIngestResult
 * @property {string} status - Result of ingestion - 'SUCCESS' / 'FAIL'
 * @property {string} [message] - The error message if the status is 'FAIL'
 */

/**
 * @param {any} orderItemResults
 * @returns {OrderIngestResult}
 */
const getOrderResultFromItems = (orderItemResults) => {
  const message = orderItemResults.reduce((msg, itemResult) => {
    if (itemResult.error) {
      logger.warn(`Item ${itemResult.record.id} failed to ingest.`
        + ` Error: ${itemResult.error.message}`)
      msg += `${msg.length === 0 ? '' : '\n'}` // Newline if there are multiple errors
        + `Item ${itemResult.record.id} failed to ingest.`
        + ` Error: ${itemResult.error.message}`
    }
    return msg
  }, '')

  if (message.length) return { status: 'FAIL', message }

  return { status: 'SUCCESS' }
}

const getOrderResults = (event, itemResults) => {
  if (!isSqsEvent(event)) return []

  const records = event.Records

  const orderResults = []
  let startIndex = 0
  for (const record of records) {
    const recordBody = JSON.parse(record.body)

    // Check if the record is an SNS notification and has an order_id
    if (isSnsMessage(recordBody) && 'order_id' in JSON.parse(recordBody.Message)) {
      const message = JSON.parse(recordBody.Message)

      const endIndex = startIndex + message.items.length
      const orderItemResults = itemResults.slice(startIndex, endIndex)

      const orderResultObject = getOrderResultFromItems(orderItemResults)

      orderResults.push({
        orderId: message.order_id,
        ...orderResultObject,
      })
      startIndex = endIndex
    } else {
      // In any other case, there was only a single item ingested, and we can skip it
      startIndex += 1
    }
  }

  return orderResults
}

export const handler = async (event, _context) => {
  logger.debug('Event: %j', event)

  if (event.create_indices) {
    await createIndex('collections')
    return
  }

  try {
    const stacItems = isSqsEvent(event)
      ? await stacItemsFromSqsEvent(event)
      : [event]

    logger.debug('Attempting to ingest %d items', stacItems.length)

    const results = await ingestItems(stacItems)

    const errorCount = results.filter((result) => result.error).length
    if (errorCount) {
      logger.debug('There were %d errors ingesting %d items', errorCount, stacItems.length)
    } else {
      logger.debug('Ingested %d items', results.length)
    }

    const postIngestTopicArn = process.env['POST_INGEST_TOPIC_ARN']

    if (postIngestTopicArn) {
      logger.debug('Publishing to post-ingest topic: %s', postIngestTopicArn)
      await publishResultsToSns(results, postIngestTopicArn)
    } else {
      logger.debug('Skipping post-ingest notification since no topic is configured')
    }

    const orderResults = getOrderResults(event, results)
    if (orderResults.length) {
      // Publish event to event bridge for each orderResult
      logger.info(`Sending ${orderResults.length} order result`
        + `${orderResults.length > 1 ? 's' : ''} to EventBridge`)
      await publishResultsToEventBridge(orderResults)
    }

    if (errorCount) throw new Error('There was at least one error ingesting items.')
  } catch (error) {
    logger.error(error)
    throw (error)
  }
}
