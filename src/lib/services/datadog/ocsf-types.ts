/**
 * OCSF (Open Cybersecurity Schema Framework) Types
 * https://schema.ocsf.io/
 */

import { SeverityLevel } from '../../events/sec-events';
import { RiskLevel } from '../../heuristics';
const { CONFIG } = require('../../config');

// OCSF Category UIDs
export enum OCSFCategoryUID {
  FINDINGS = 2,
}

// OCSF Class UIDs
export enum OCSFClassUID {
  DETECTION_FINDING = 2004,
  APP_SECURITY_POSTURE_FINDING = 2007,
}

// OCSF Activity IDs
export enum OCSFActivityID {
  CREATE = 1,
  UPDATE = 2,
  CLOSE = 3,
}

// OCSF Severity IDs
export enum OCSFSeverityID {
  INFO = 1,
  LOW = 2,
  MEDIUM = 3,
  HIGH = 4,
  CRITICAL = 5,
}

// OCSF Status IDs
export enum OCSFStatusID {
  NEW = 1,
  IN_PROGRESS = 2,
  SUPPRESSED = 3,
  RESOLVED = 4,
}

// OCSF Observable Type IDs - https://schema.ocsf.io/1.6.0/objects/observable
export enum OCSFObservableTypeID {
  UNKNOWN = 0,
  IP_ADDRESS = 2,
  USERNAME = 4,
  URL_STRING = 6,
  FILE_NAME = 7,
  RESOURCE_UID = 10,
  COMMAND_LINE = 13,
  SCRIPT_CONTENT = 36,
  FILE_PATH = 45,
  OTHER = 99,
}

// OCSF Resource Role IDs
export enum OCSFResourceRoleID {
  ACTOR = 3, // we assume the extension is always the actor of the event
}

/**
 * Base OCSF metadata
 */
export interface OCSFMetadata {
  version: string;
  product: { name: string; vendor_name: string };
}

/**
 * OCSF Finding Info
 */
export interface OCSFFindingInfo {
  uid: string;
  title: string;
  desc?: string;
}

/**
 * OCSF Resource
 */
export interface OCSFResource {
  uid: string;
  version?: string;
  data?: Record<string, any>;
  role_id?: OCSFResourceRoleID;
}

/**
 * OCSF Observable
 */
export interface OCSFObservable {
  name: string;
  type_id: OCSFObservableTypeID;
  value: string;
}

/**
 * OCSF Application
 */
export interface OCSFApplication {
  name: string;
  uid: string;
  vendor_name: string;
  version: string;
  path?: string;
}

/**
 * Base OCSF Finding Event
 */
export interface OCSFBaseFinding {
  activity_id: OCSFActivityID;
  category_uid: OCSFCategoryUID;
  class_uid: OCSFClassUID;
  severity_id: OCSFSeverityID;
  time: number;
  type_uid: number;
  metadata: OCSFMetadata;
  finding_info: OCSFFindingInfo;
  status_id: OCSFStatusID;
  is_alert: boolean;
}

/**
 * OCSF Detection Finding (class_uid: 2004)
 */
export interface OCSFDetectionFinding extends OCSFBaseFinding {
  class_uid: OCSFClassUID.DETECTION_FINDING;
  type_uid: number; // 200401 (CREATE) | 200402 (UPDATE) | 200403 (CLOSE)
  resources?: OCSFResource[];
  observables?: OCSFObservable[];
}

/**
 * OCSF Application Security Posture Finding (class_uid: 2007)
 */
export interface OCSFAppSecurityPostureFinding extends OCSFBaseFinding {
  class_uid: OCSFClassUID.APP_SECURITY_POSTURE_FINDING;
  type_uid: number; // 200701 (CREATE) | 200702 (UPDATE) | 200703 (CLOSE)
  application: OCSFApplication;
  observables?: OCSFObservable[];
}

export class OCSFHelpers {
  static severityToOCSF(severity: SeverityLevel): OCSFSeverityID {
    switch (severity) {
      case SeverityLevel.LOW:
        return OCSFSeverityID.LOW;
      case SeverityLevel.MEDIUM:
        return OCSFSeverityID.MEDIUM;
      case SeverityLevel.HIGH:
        return OCSFSeverityID.HIGH;
      default:
        return OCSFSeverityID.INFO;
    }
  }

  static riskLevelToOCSF(risk: RiskLevel): OCSFSeverityID {
    switch (risk) {
      case RiskLevel.Low:
        return OCSFSeverityID.LOW;
      case RiskLevel.Medium:
        return OCSFSeverityID.MEDIUM;
      case RiskLevel.High:
        return OCSFSeverityID.HIGH;
      case RiskLevel.None:
      default:
        return OCSFSeverityID.INFO;
    }
  }

  static createTypeUID(classUID: OCSFClassUID, activityID: OCSFActivityID): number {
    return classUID * 100 + activityID;
  }

  static createMetadata(): OCSFMetadata {
    return {
      version: CONFIG.DATADOG.OCSF.SCHEMA_VERSION,
      product: { name: CONFIG.DATADOG.OCSF.PRODUCT_NAME, vendor_name: CONFIG.DATADOG.OCSF.VENDOR_NAME },
    };
  }
}
