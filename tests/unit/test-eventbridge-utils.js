import test from 'ava'
import { randomUUID } from 'crypto'
import { validateIngestionCompletedEventSchema, convertToEventBridgeEvent } from '../../src/lib/eventbridge-utils.js'

const validEvent = {
  orderId: randomUUID(),
  status: 'SUCCESS'
}

test('schema validation returns undefined for a valid SUCCESS event', (t) => {
  const result = validateIngestionCompletedEventSchema(validEvent)

  t.is(result, undefined, 'validation returned unexpected errors')
})

test('schema validation returns undefined for a valid FAIL event', (t) => {
  const errorEvent = JSON.parse(JSON.stringify(validEvent))
  errorEvent.status = 'FAIL'
  errorEvent.message = 'Ingest Failed'

  const result = validateIngestionCompletedEventSchema(errorEvent)

  t.is(result, undefined, 'validation returned unexpected errors')
})

Object.keys(validEvent).forEach((payloadKey) => {
  test(`schema validation returns error when ${payloadKey} is missing`, (t) => {
    // Arrange
    const event = JSON.parse(JSON.stringify(validEvent))
    delete event[payloadKey]

    // Act
    const result = validateIngestionCompletedEventSchema(event)

    t.truthy(result, 'Invalid event passed validation')

    // @ts-ignore
    t.is(result.length, 1)

    // @ts-ignore
    const error = result[0]

    // @ts-ignore
    t.is(error.message, `must have required property '${payloadKey}'`, 'Incorrect error received')
  })
})

test('schema validation returns an error when message is missing in failed event', (t) => {
  // Arrange
  const errorEvent = JSON.parse(JSON.stringify(validEvent))
  errorEvent.status = 'FAIL'

  // Act
  const result = validateIngestionCompletedEventSchema(errorEvent)

  t.truthy(result, 'Invalid event passed validation')

  // Assert
  // @ts-ignore - I already checked that result exists
  t.is(result.length, 1)

  // @ts-ignore
  const error = result[0]
  // @ts-ignore
  t.is(error.message, 'must have required property \'message\'', 'Incorrect error received')
})

test('convertToEventBridgeEvent should return EventBridge format', (t) => {
  const eventBus = 'default'
  const result = convertToEventBridgeEvent(eventBus, validEvent)

  t.is(result.EventBusName, eventBus, 'Incorrect EventBusName')
  t.is(result.Source, 'stac.ingest.lambda', 'Incorrect Source')
  t.is(result.DetailType, 'StacIngestCompleted', 'Incorrect DetailType')
  t.is(result.Detail, JSON.stringify(validEvent), 'Incorrect detail')
  t.deepEqual(result.Resources, [], 'Incorrect resources')
})
