export default {
  $schema: 'http://json-schema.org/draft-04/schema#',
  id: 'https://halasystems.com/fabric/event-ingest-completed.v1.0.0.json',
  title: 'Imagery ingestion completed event',
  description: 'An event emitted after the ingestion of satellite imagery'
    + ' is completed in the STAC server',
  type: 'object',
  properties: {
    eventType: {
      const: 'IngestCompleted',
    },
    producerName: {
      description: 'Name of the producer of the event.',
      type: 'string',
      minLength: 2
    },
    version: {
      const: '1.0.0'
    },
    tags: {
      description: 'Information about the sender of the event.',
      type: 'object',
      properties: {
        account: {
          description: 'Name of the AWS account.',
          type: 'string',
          minLength: 2
        },
        stage: {
          description: 'Deploy stage.',
          type: 'string',
          minLength: 3
        },
        deployVersion: {
          description: 'Version of the producer of this event.',
          type: 'string',
          minLength: 2
        },
        test: {
          description: 'Indicator that the event is a test.',
          type: 'boolean'
        }
      },
      required: [
        'account',
        'stage',
        'deployVersion'
      ],
      additionalProperties: true
    },
    payload: {
      type: 'object',
      properties: {
        orderId: {
          description: 'The ID of the order, as provided by the imagery service '
            + '(only Planet is supported at the moment)',
          type: 'string',
          format: 'uuid'
        },
        status: {
          description: 'The resulting status of the ingestion process',
          type: 'string',
          enum: ['SUCCESS', 'FAIL']
        },
        message: {
          description: 'The error message(s) for the items that have failed to ingest, '
            + 'in case the status is `FAIL`',
          type: 'string'
        }
      },
      required: ['orderId', 'status'],
      allOf: [
        {
          if: {
            properties: { status: { const: 'FAIL' } },
            required: ['status']
          },
          then: { required: ['message'] }
        }
      ],
      additionalProperties: false
    },
    flowId: {
      description: 'ID of the flow for multiple events.',
      type: 'string',
      minLength: 2
    }
  },
  required: [
    'eventType',
    'producerName',
    'version',
    'tags',
    'payload',
    'flowId'
  ],
  additionalProperties: false
}
