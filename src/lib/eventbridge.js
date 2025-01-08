import { PutEventsCommand } from '@aws-sdk/client-eventbridge'
import { eventBridge } from './aws-clients.js'
import logger from './logger.js'

/* eslint-disable-next-line import/prefer-default-export */
export async function publishRecordsToEventBridge(
  payloads,
  eventBusName,
  source,
  detailType,
  resources
) {
  let result
  try {
    const command = new PutEventsCommand({
      Entries: payloads.map((orderData) => ({
        EventBusName: eventBusName,
        Source: source,
        DetailType: detailType,
        Detail: JSON.stringify(orderData),
        Resources: resources,
      }))
    })
    result = await eventBridge().send(command)
    if (result.Entries) {
      result.Entries.forEach((entry) => {
        if (entry.ErrorMessage) {
          logger.error(`Failed to write event ${result?.EventId}`
            + ` to ${eventBusName}: ${entry.ErrorMessage}`)
        }
        logger.info(`Wrote event ${entry?.EventId} to ${eventBusName} bus`)
      })
    }
    return result
  } catch (err) {
    logger.error(`Failed to write events to ${eventBusName}: ${err}`)
    throw err
  }
}
