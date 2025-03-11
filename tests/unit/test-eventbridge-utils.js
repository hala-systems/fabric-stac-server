import test from 'ava'
import { randomUUID } from 'crypto'
import {
  validateIngestionCompletedEventSchema,
  convertToEventBridgeEvent,
  convertOrderIngestResultToIngestCompletedEvent,
} from '../../src/lib/eventbridge-utils.js'

const validEvent = {
  eventType: 'IngestCompleted',
  producerName: 'stac-ingest-service',
  version: '1.0.0',
  tags: {
    account: 'Fabric-Staging',
    stage: 'test',
    deployVersion: '1.0.0'
  },
  payload: {
    orderId: randomUUID(),
    status: 'SUCCESS'
  },
  flowId: randomUUID()
}

test('schema validation returns undefined for a valid SUCCESS event', (t) => {
  const result = validateIngestionCompletedEventSchema(validEvent)

  t.is(result, undefined, 'validation returned unexpected errors')
})

test('schema validation returns undefined for a valid FAIL event', (t) => {
  const errorEvent = JSON.parse(JSON.stringify(validEvent))
  errorEvent.payload.status = 'FAIL'
  errorEvent.payload.message = 'Ingest Failed'

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
  errorEvent.payload.status = 'FAIL'

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
  t.is(result.DetailType, 'IngestCompleted', 'Incorrect DetailType')
  t.is(result.Detail, JSON.stringify(validEvent), 'Incorrect detail')
  t.deepEqual(result.Resources, [], 'Incorrect resources')
})

test('convertOrderIngestResultToIngestCompletedEvent should convert successful result to event', (t) => {
  process.env['AWS_STAGE'] = 'test'

  // Arrange
  const orderId = randomUUID()
  const orderIngestResult = {
    orderId,
    status: 'SUCCESS'
  }

  // Act
  const result = convertOrderIngestResultToIngestCompletedEvent(orderIngestResult)

  // Assert
  t.is(result.eventType, 'IngestCompleted', 'Incorrect eventType')
  t.is(result.producerName, 'stac-ingest-service', 'Incorrect producerName')
  t.is(result.version, '1.0.0', 'Incorrect version')
  t.deepEqual(result.tags, {
    account: 'Fabric-Staging',
    stage: 'test',
    deployVersion: '3.9.0'
  }, 'Incorrect tags')
  t.deepEqual(result.payload, orderIngestResult, 'Incorrect payload')
  t.is(result.flowId, orderId, 'Incorrect flowId')
})

test('convertOrderIngestResultToIngestCompletedEvent should convert failed result to event', (t) => {
  process.env['AWS_STAGE'] = 'test'

  // Arrange
  const orderId = randomUUID()
  const orderIngestResult = {
    orderId,
    status: 'FAIL',
    message: 'Something went wrong'
  }

  // Act
  const result = convertOrderIngestResultToIngestCompletedEvent(orderIngestResult)

  // Assert
  t.is(result.eventType, 'IngestCompleted', 'Incorrect eventType')
  t.is(result.producerName, 'stac-ingest-service', 'Incorrect producerName')
  t.is(result.version, '1.0.0', 'Incorrect version')
  t.deepEqual(result.tags, {
    account: 'Fabric-Staging',
    stage: 'test',
    deployVersion: '3.9.0'
  }, 'Incorrect tags')
  t.deepEqual(result.payload, orderIngestResult, 'Incorrect payload')
  t.is(result.flowId, orderId, 'Incorrect flowId')
})

test('convertOrderIngestResultToIngestCompletedEvent should use NODE_ENV for stage tag', (t) => {
  process.env['AWS_STAGE'] = 'production'

  // Arrange
  const orderId = randomUUID()
  const orderIngestResult = {
    orderId,
    status: 'SUCCESS'
  }

  // Act
  const result = convertOrderIngestResultToIngestCompletedEvent(orderIngestResult)

  // Assert
  t.is(result.tags.stage, 'production', 'Stage tag should match AWS_STAGE')
})
