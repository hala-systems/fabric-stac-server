export default {
  title: 'Imagery ingestion completed event',
  description: 'An event emitted after the ingestion of satellite imagery'
    + ' is completed in the STAC server.',
  type: 'object',
  properties: {
    orderId: {
      description: 'The ID of the order, as provided by the imagery'
        + ' service (only Planet is supported at the moment)',
      type: 'string',
      format: 'uuid'
    },
    status: {
      description: 'The resulting status of the ingestion process',
      type: 'string',
      enum: ['SUCCESS', 'FAIL']
    },
    message: {
      description: 'The error message(s) for the items that have'
        + ' failed to ingest, in case the status is `FAIL`',
      type: 'string'
    }
  },
  required: ['orderId', 'status'],
  allOf: [
    {
      if: {
        properties: {
          status: {
            const: 'FAIL'
          }
        },
        required: ['status']
      },
      then: {
        required: ['message']
      }
    }
  ]
}
