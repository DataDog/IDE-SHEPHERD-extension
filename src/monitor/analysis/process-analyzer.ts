import { IoC, SeverityLevel, SecurityEvent } from '../../lib/events/sec-events';
import { Logger } from '../../lib/logger';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { AnalysisResult } from './analyzer';
import { ExecEvent } from '../../lib/events/process-events';

export class ProcessAnalyzer {
  analyze(ev: ExecEvent): AnalysisResult | undefined {
    const startTime = Date.now();

    try {
      let result = new AnalysisResult();

      // Check for PowerShell execution
      const powershellResult = this.checkPowershellScripts(ev);
      if (powershellResult.securityEvent) {
        result = powershellResult;
      }

      // Check for curl/wget pipe execution
      if (!result.securityEvent) {
        const curlPipeResult = this.checkCommandExec(ev);
        if (curlPipeResult.securityEvent) {
          result = curlPipeResult;
        }
      }

      if (result?.securityEvent) {
        IDEStatusService.emitSecurityEvent(result.securityEvent).catch((error) => {
          Logger.error(`ProcessAnalyzer: Failed to record security event: ${error.message}`);
        });
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;
      IDEStatusService.updatePerformanceMetrics(processingTime).catch((error) => {
        Logger.error(`ProcessAnalyzer: Failed to record processing time: ${error.message}`);
      });

      return result;
    } catch (error) {
      Logger.error('ProcessAnalyzer: Error during analysis', error as Error);
      return new AnalysisResult();
    }
  }

  private checkPowershellScripts(ev: ExecEvent): AnalysisResult {
    const powershellPattern = /\b(powershell|pwsh)(\.exe)?\b/i;
    const fullCommand = `${ev.cmd} ${ev.args.join(' ')}`;

    if (powershellPattern.test(ev.cmd) || powershellPattern.test(fullCommand)) {
      const suspiciousFlags =
        /-(?:enc|encodedcommand|exec|executionpolicy\s+bypass|noprofile|windowstyle\s+hidden|noninteractive)/i;

      if (suspiciousFlags.test(fullCommand)) {
        return new AnalysisResult(
          { allowed: false },
          new SecurityEvent(ev, ev.extension, SeverityLevel.LOW, [
            {
              finding: fullCommand,
              rule: 'PowerShell Execution',
              description: `Detected PowerShell execution: ${fullCommand}`,
              confidence: 0.8,
              severity: SeverityLevel.HIGH,
            },
          ]),
        );
      }
    }

    return new AnalysisResult();
  }

  private checkCommandExec(ev: ExecEvent): AnalysisResult {
    const fullCommand = `${ev.cmd} ${ev.args.join(' ')}`;
    const commandExecPattern = /\b(sh|bash|zsh|curl|wget)\b/i;

    if (commandExecPattern.test(fullCommand)) {
      return new AnalysisResult(
        { allowed: false },
        new SecurityEvent(ev, ev.extension, SeverityLevel.HIGH, [
          {
            finding: fullCommand,
            rule: 'Remote Code Execution via Pipe',
            description: `Detected remote code execution attempt: ${fullCommand}`,
            confidence: 1,
            severity: SeverityLevel.HIGH,
          },
        ]),
      );
    }

    return new AnalysisResult();
  }
}
