import { PutEventsCommand } from '@aws-sdk/client-eventbridge'
import { eventBridge } from './aws-clients.js'
import logger from './logger.js'

/**
 * @typedef {import('@aws-sdk/client-eventbridge').PutEventsRequestEntry} PutEventsRequestEntry
 */

/**
 * @param {PutEventsRequestEntry[]} events
 * @param {string} eventBusName
*/
/* eslint-disable-next-line import/prefer-default-export */
export async function publishRecordsToEventBridge(
  events,
  eventBusName,
) {
  try {
    const command = new PutEventsCommand({ Entries: events })
    const result = await eventBridge().send(command)

    if (result.Entries) {
      result.Entries.forEach((entry) => {
        if (entry.ErrorMessage) {
          logger.error(`Failed to write event ${entry?.EventId}`
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
