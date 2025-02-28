import { PutRuleCommand, PutTargetsCommand } from '@aws-sdk/client-eventbridge'
import { AddPermissionCommand } from '@aws-sdk/client-sqs'

import { eventBridge as _eventBridge, sqs as _sqs } from '../../src/lib/aws-clients.js'

/**
 * @param {string} queueArn
 * @param {string} queueUrl
 * @returns {Promise<void>}
 */
/**
 * Adds a the specified SQS queue as a target for the `default` event bus
 * This enables the tests to read the published events and validate them
 * @param {*} queueArn - The ARN of the SQS queue
 * @param {*} queueUrl - The URL of the SQS queue
 * @returns {Promise<void>}
*/
// eslint-disable-next-line import/prefer-default-export
export const addEventBridgeToSqsSubscription = async (
  queueArn,
  queueUrl,
) => {
  try {
    const ruleName = 'test-rule'
    const ruleParams = {
      Name: ruleName,
      EventBusName: 'default', // TODO: Replace with custom event bus
      EventPattern: JSON.stringify({
        source: ['stac.ingest.lambda'], // TODO: Replace with custom event source
      }),
    }

    const ruleCommand = new PutRuleCommand(ruleParams)
    await _eventBridge().send(ruleCommand)

    const targetParams = {
      Rule: ruleName,
      EventBusName: 'default', // TODO: Replace with custom event bus
      Targets: [{ Id: '1', Arn: queueArn }],
    }

    const targetCommand = new PutTargetsCommand(targetParams)
    await _eventBridge().send(targetCommand)

    const permissionCommand = new AddPermissionCommand({
      QueueUrl: queueUrl,
      Label: 'EventBridgePermission',
      AWSAccountIds: ['123456789012'], // TODO: Replace with testing account ID
      Actions: ['SendMessage'],
    })

    await _sqs().send(permissionCommand)
  } catch (e) {
    console.log(`Setting up EventBridge Failed. Error: ${e}`)
  }
}
