/**
 * OCSF Builder - Constructs OCSF-compliant events from IDE Shepherd data
 */

import { SecurityEvent } from '../../events/sec-events';
import { HeuristicResult, SuspiciousPattern } from '../../heuristics';
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
  OCSFHelpers,
  OCSFObservable,
  OCSFResource,
} from './ocsf-types';

/**
 * Builds OCSF Detection Finding events from SecurityEvent
 */
export class OCSFDetectionFindingBuilder {
  static build(securityEvent: SecurityEvent, activity: OCSFActivityID = OCSFActivityID.CREATE): OCSFDetectionFinding {
    const primaryIoC = securityEvent.getPrimaryIoC();

    return {
      activity_id: activity,
      category_uid: OCSFCategoryUID.FINDINGS,
      class_uid: OCSFClassUID.DETECTION_FINDING,
      severity_id: OCSFHelpers.severityToOCSF(securityEvent.severity),
      time: securityEvent.timestamp,
      type_uid: OCSFHelpers.createTypeUID(OCSFClassUID.DETECTION_FINDING, activity),
      metadata: OCSFHelpers.createMetadata(),

      finding_info: {
        uid: securityEvent.secEventId,
        title: `Security Detection: ${primaryIoC.rule}`,
        desc: primaryIoC.description,
      },
      resources: [{ uid: securityEvent.extension.id, role_id: OCSFResourceRoleID.ACTOR }],
      observables: this.buildObservables(securityEvent),
      status_id: activity === OCSFActivityID.CLOSE ? OCSFStatusID.RESOLVED : OCSFStatusID.NEW,
      is_alert: true,
    };
  }

  private static buildObservables(securityEvent: SecurityEvent): OCSFObservable[] {
    return securityEvent.iocs.map((ioc) => ({
      name: ioc.rule,
      type_id: this.getObservableType(securityEvent.originalEvent.eventType, ioc.finding),
      value: ioc.finding,
    }));
  }

  // We'll add more cases as we add more rules
  private static getObservableType(eventTarget: Target, finding: string): OCSFObservableTypeID {
    // Determine observable type based on the event target type
    if (eventTarget === Target.PROCESS) {
      return OCSFObservableTypeID.COMMAND_LINE;
    }
    return OCSFObservableTypeID.URL_STRING;
  }
}

/**
 * Builds OCSF Application Security Posture Finding events from HeuristicResult
 */
export class OCSFAppSecurityPostureFindingBuilder {
  static build(
    result: HeuristicResult,
    extension: Extension,
    activity: OCSFActivityID = OCSFActivityID.CREATE,
  ): OCSFAppSecurityPostureFinding {
    const patternsCount = result.suspiciousPatterns.length;
    const riskScore = result.riskScore;
    const overallRisk = result.overallRisk;

    return {
      activity_id: activity,
      category_uid: OCSFCategoryUID.FINDINGS,
      class_uid: OCSFClassUID.APP_SECURITY_POSTURE_FINDING,
      severity_id: OCSFHelpers.riskLevelToOCSF(result.overallRisk),
      time: Date.now(),
      type_uid: OCSFHelpers.createTypeUID(OCSFClassUID.APP_SECURITY_POSTURE_FINDING, activity),
      metadata: OCSFHelpers.createMetadata(),

      finding_info: {
        uid: `${extension.id}-metadata-analysis`,
        title: `Metadata Analysis: ${extension.id}`,
        desc: `Detected ${patternsCount} suspicious pattern(s) (Risk: ${overallRisk}, Score: ${riskScore})`,
      },
      application: {
        name: extension.displayName || extension.id,
        uid: extension.id,
        vendor_name: extension.packageJSON?.publisher || 'unknown',
        version: extension.packageJSON?.version || 'unknown',
        path: extension.extensionPath,
      },
      observables: this.buildObservables(result.suspiciousPatterns),

      status_id: activity === OCSFActivityID.CLOSE ? OCSFStatusID.RESOLVED : OCSFStatusID.NEW,
      is_alert: overallRisk === 'high' || overallRisk === 'medium',
    };
  }

  private static buildObservables(patterns: SuspiciousPattern[]): OCSFObservable[] {
    return patterns.map((pattern) => ({
      name: pattern.pattern,
      type_id: this.getObservableTypeFromCategory(pattern.category),
      value: pattern.description,
    }));
  }

  private static getObservableTypeFromCategory(category: string): OCSFObservableTypeID {
    // Map pattern categories to OCSF observable types
    switch (category.toLowerCase()) {
      case 'commands':
        return OCSFObservableTypeID.COMMAND_LINE;
      // In the future, we'll either adapt the metadata heuristics type or add more ocsf types to cover our use case
      default:
        return OCSFObservableTypeID.OTHER;
    }
  }
}

export class OCSFBuilder {
  static buildDetectionFinding(
    securityEvent: SecurityEvent,
    activity: OCSFActivityID = OCSFActivityID.CREATE,
  ): OCSFDetectionFinding {
    return OCSFDetectionFindingBuilder.build(securityEvent, activity);
  }

  static buildAppSecurityPostureFinding(
    result: HeuristicResult,
    extension: Extension,
    activity: OCSFActivityID = OCSFActivityID.CREATE,
  ): OCSFAppSecurityPostureFinding {
    return OCSFAppSecurityPostureFindingBuilder.build(result, extension, activity);
  }
}
