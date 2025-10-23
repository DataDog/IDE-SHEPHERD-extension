/**
 * OCSF Builder - Constructs OCSF-compliant events from IDE Shepherd data
 */

import { SecurityEvent } from '../../events/sec-events';
import { HeuristicResult, SuspiciousPattern, RiskLevel } from '../../heuristics';
import { Extension } from '../../extensions';
import { Target } from '../../events/ext-events';
import {
  OCSFDetectionFinding,
  OCSFAppSecurityPostureFinding,
  OCSFActivityID,
  OCSFCategoryUID,
  OCSFClassUID,
  OCSFStatusID,
  OCSFObservableTypeID,
  OCSFResourceRoleID,
  severityToOCSF,
  riskLevelToOCSF,
  createTypeUID,
  createOCSFMetadata,
} from './ocsf-types';

/**
 * Build OCSF Detection Finding from SecurityEvent
 */
export function buildDetectionFinding(
  securityEvent: SecurityEvent,
  activity: OCSFActivityID = OCSFActivityID.CREATE,
): OCSFDetectionFinding {
  const primaryIoC = securityEvent.getPrimaryIoC();

  return {
    activity_id: activity,
    category_uid: OCSFCategoryUID.FINDINGS,
    class_uid: OCSFClassUID.DETECTION_FINDING,
    severity_id: severityToOCSF(securityEvent.severity),
    time: securityEvent.timestamp,
    type_uid: createTypeUID(OCSFClassUID.DETECTION_FINDING, activity),
    metadata: createOCSFMetadata(),
    finding_info: {
      uid: securityEvent.secEventId,
      title: `Security Detection: ${primaryIoC.rule}`,
      desc: primaryIoC.description,
    },
    resources: [{ uid: securityEvent.extension.id, role_id: OCSFResourceRoleID.ACTOR }],
    observables: securityEvent.iocs.map((ioc) => ({
      name: ioc.rule,
      type_id: getObservableTypeFromTarget(securityEvent.originalEvent.eventType),
      value: ioc.finding,
    })),
    status_id: activity === OCSFActivityID.CLOSE ? OCSFStatusID.RESOLVED : OCSFStatusID.NEW,
    isAlert: true,
  };
}

/**
 * Build OCSF App Security Posture Finding from HeuristicResult
 */
export function buildAppSecurityPostureFinding(
  result: HeuristicResult,
  extension: Extension,
  activity: OCSFActivityID = OCSFActivityID.CREATE,
): OCSFAppSecurityPostureFinding {
  return {
    activity_id: activity,
    category_uid: OCSFCategoryUID.FINDINGS,
    class_uid: OCSFClassUID.APP_SECURITY_POSTURE_FINDING,
    severity_id: riskLevelToOCSF(result.overallRisk),
    time: Date.now(),
    type_uid: createTypeUID(OCSFClassUID.APP_SECURITY_POSTURE_FINDING, activity),
    metadata: createOCSFMetadata(),
    finding_info: {
      uid: `${extension.id}-metadata-analysis`,
      title: `Metadata Analysis: ${extension.id}`,
      desc: `Detected ${result.suspiciousPatterns.length} suspicious pattern(s) (Risk: ${result.overallRisk}, Score: ${result.riskScore})`,
    },
    application: {
      name: extension.displayName || extension.id,
      uid: extension.id,
      vendor_name: extension.packageJSON?.publisher || 'unknown',
      version: extension.packageJSON?.version || 'unknown',
      path: extension.extensionPath,
    },
    observables: result.suspiciousPatterns.map((pattern) => ({
      name: pattern.pattern,
      type_id: getObservableTypeFromCategory(pattern.category),
      value: pattern.description,
    })),
    status_id: activity === OCSFActivityID.CLOSE ? OCSFStatusID.RESOLVED : OCSFStatusID.NEW,
    isAlert: result.overallRisk === RiskLevel.High || result.overallRisk === RiskLevel.Medium,
  };
}

function getObservableTypeFromTarget(eventTarget: Target): OCSFObservableTypeID {
  return eventTarget === Target.PROCESS ? OCSFObservableTypeID.COMMAND_LINE : OCSFObservableTypeID.URL_STRING;
}

function getObservableTypeFromCategory(category: string): OCSFObservableTypeID {
  return category.toLowerCase() === 'commands' ? OCSFObservableTypeID.COMMAND_LINE : OCSFObservableTypeID.OTHER;
}
