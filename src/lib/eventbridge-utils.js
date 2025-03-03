import Ajv from 'ajv-draft-04'
import AjvFormats from 'ajv-formats'

import orderIngestionCompletedSchema from '../schemas/event-order-ingestion-completed.v1.0.0.js'
import { getRequiredEnvVar } from './utils.js'

// @ts-ignore - Suppress error because it's incorrect
const ajv = new Ajv()
const schema = orderIngestionCompletedSchema

// @ts-ignore - Suppress error because it's incorrect
AjvFormats(ajv)
const validate = ajv.compile(schema)

/**
 * @typedef {import('../lambdas/ingest/index.js').OrderIngestResult} OrderIngestResult
 * @typedef {Object} IngestCompletedEvent
 * @property {string} eventType
 * @property {string} producerName
 * @property {string} version
 * @property {Object} tags
 * @property {OrderIngestResult} payload
 * @property {string} flowId
 */

/**
 * @param {IngestCompletedEvent} event
 * @returns {{message: string}[] | undefined}
*/
export function validateIngestionCompletedEventSchema(event) {
  const valid = validate(event)

  if (!valid) return validate.errors

  return undefined
}

/**
 * @typedef {import('@aws-sdk/client-eventbridge').PutEventsRequestEntry} PutEventsRequestEntry
 */

/**
 * Inserts the given detail into the EventBridge wrapper
 * @param {string} eventBus
 * @param {Object} detail
 * @returns {PutEventsRequestEntry}
 */
export function convertToEventBridgeEvent(eventBus, detail) {
  return {
    EventBusName: eventBus,
    Source: 'stac.ingest.lambda',
    DetailType: 'IngestCompleted',
    Detail: JSON.stringify(detail),
    Resources: [],
  }
}

/**
 * @param {OrderIngestResult} result
 * @returns {IngestCompletedEvent}
 */
export function convertOrderIngestResultToIngestCompletedEvent(result) {
  return {
    eventType: 'IngestCompleted',
    producerName: 'stac-ingest-service',
    version: '1.0.0',
    tags: {
      account: 'Fabric-Staging',
      stage: getRequiredEnvVar('NODE_ENV'),
      deployVersion: '1.0.0'
    },
    payload: result,
    flowId: result.orderId,
  }
}
