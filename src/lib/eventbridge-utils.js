import Ajv from 'ajv'
import AjvFormats from 'ajv-formats'

import orderIngestionCompletedSchema from '../schemas/event-order-ingestion-completed.v0.1.0.js'

// @ts-ignore - Suppress error because it's incorrect
const ajv = new Ajv()
const schema = orderIngestionCompletedSchema

// @ts-ignore - Suppress error because it's incorrect
AjvFormats(ajv)
const validate = ajv.compile(schema)

/**
 * @typedef {import('../lambdas/ingest/index.js').OrderIngestResult} OrderIngestResult
 */

/**
 * @param {OrderIngestResult} event
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
    DetailType: 'StacIngestCompleted',
    Detail: JSON.stringify(detail),
    Resources: [],
  }
}
