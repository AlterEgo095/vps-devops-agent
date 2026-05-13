/**
 * Tool: dns_check — DNS resolution and diagnostic checks
 * Risk: SAFE (read-only diagnostic tool)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'dns_check',
  description: 'Perform DNS resolution and diagnostic checks on the remote server. Supports resolving domain names to IP addresses, reverse DNS lookups (IP to domain), DNS trace (follows the delegation path from root), and nslookup queries. Use this tool to diagnose DNS issues, verify domain configurations, check propagation status, and troubleshoot connectivity problems. All actions are safe read-only operations that do not modify any configuration.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'DNS check action to perform',
        enum: ['resolve', 'reverse', 'trace', 'nslookup']
      },
      domain: {
        type: 'string',
        description: 'Domain name or IP address to check (e.g., "example.com", "192.168.1.1"). Required for all actions.'
      },
      record_type: {
        type: 'string',
        description: 'DNS record type to query (e.g., "A", "AAAA", "MX", "CNAME", "TXT", "NS", "SOA", "SRV"). Used with resolve and nslookup actions. Defaults to "A".',
        default: 'A'
      }
    },
    required: ['action', 'domain']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'monitoring',

  async implementation(serverConfig, args, context) {
    const { action, domain, record_type = 'A' } = args;

    // Validate action
    const validActions = ['resolve', 'reverse', 'trace', 'nslookup'];
    if (!validActions.includes(action)) {
      return {
        success: false,
        error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`
      };
    }

    // Validate domain
    if (!domain) {
      return {
        success: false,
        error: 'Domain parameter is required for all DNS check actions'
      };
    }

    // Validate domain format (allows domain names and IP addresses)
    const validDomainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*$/;
    const validIPPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    const validIPv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

    if (!validDomainPattern.test(domain) && !validIPPattern.test(domain) && !validIPv6Pattern.test(domain)) {
      return {
        success: false,
        error: `Invalid domain or IP address: ${domain}`
      };
    }

    // Validate record type
    const validRecordTypes = ['A', 'AAAA', 'MX', 'CNAME', 'TXT', 'NS', 'SOA', 'SRV', 'PTR', 'CAA', 'ANY'];
    const normalizedRecordType = record_type.toUpperCase();
    if (!validRecordTypes.includes(normalizedRecordType)) {
      return {
        success: false,
        error: `Invalid record type: ${record_type}. Must be one of: ${validRecordTypes.join(', ')}`
      };
    }

    let command;

    switch (action) {
      case 'resolve': {
        command = `dig +short ${normalizedRecordType} "${domain}" 2>&1`;
        break;
      }
      case 'reverse': {
        // For reverse DNS, use the -x flag with dig
        if (validIPPattern.test(domain) || validIPv6Pattern.test(domain)) {
          command = `dig +short -x "${domain}" 2>&1`;
        } else {
          // If a domain was provided, first resolve it, then do reverse lookup
          command = `IP=$(dig +short A "${domain}" | head -1) && if [ -n "$IP" ]; then echo "Forward: ${domain} -> $IP" && echo "Reverse:" && dig +short -x "$IP"; else echo "Could not resolve ${domain}"; fi 2>&1`;
        }
        break;
      }
      case 'trace': {
        command = `dig +trace ${normalizedRecordType} "${domain}" 2>&1`;
        break;
      }
      case 'nslookup': {
        command = `nslookup -type=${normalizedRecordType} "${domain}" 2>&1`;
        break;
      }
    }

    const result = await executeCommand(serverConfig, command);

    if (!result.success) {
      // DNS tools generally don't fail hard, but check for missing tools
      if (result.output?.includes('command not found') || result.output?.includes('dig: not found')) {
        return {
          success: false,
          error: 'DNS tools (dig/nslookup) are not installed on this server. Install them with: apt install dnsutils'
        };
      }
      if (result.output?.includes('connection timed out') || result.output?.includes('no servers could be reached')) {
        return {
          success: false,
          error: `DNS query timed out for "${domain}". The DNS server may be unreachable or the domain does not exist.`,
          exit_code: result.exit_code
        };
      }
      return {
        success: false,
        error: result.error || `Failed to perform DNS ${action} for "${domain}"`,
        exit_code: result.exit_code,
        output: result.output
      };
    }

    // Process results based on action
    switch (action) {
      case 'resolve': {
        const records = result.output.trim().split('\n')
          .filter(line => line.trim())
          .map(line => line.trim());
        return {
          success: true,
          action: 'resolve',
          domain,
          record_type: normalizedRecordType,
          records,
          count: records.length,
          message: records.length > 0
            ? `Found ${records.length} ${normalizedRecordType} record(s) for "${domain}"`
            : `No ${normalizedRecordType} records found for "${domain}"`
        };
      }

      case 'reverse': {
        const records = result.output.trim().split('\n')
          .filter(line => line.trim())
          .map(line => line.trim());
        return {
          success: true,
          action: 'reverse',
          domain,
          records,
          count: records.length,
          message: records.length > 0
            ? `Reverse DNS for "${domain}": ${records.join(', ')}`
            : `No reverse DNS (PTR) record found for "${domain}"`
        };
      }

      case 'trace': {
        // Parse trace output into delegation steps
        const traceLines = result.output.trim().split('\n')
          .filter(line => line.trim());
        return {
          success: true,
          action: 'trace',
          domain,
          record_type: normalizedRecordType,
          trace: traceLines,
          message: `DNS trace for "${domain}" (${normalizedRecordType}) completed with ${traceLines.length} lines`
        };
      }

      case 'nslookup': {
        const lines = result.output.trim().split('\n')
          .filter(line => line.trim());
        // Parse nslookup output
        let server = '';
        let answers = [];
        for (const line of lines) {
          const serverMatch = line.match(/Server:\s*(.+)/);
          if (serverMatch) server = serverMatch[1].trim();
          if (line.includes('name =') || line.includes('address') || line.includes('mail exchanger') || line.includes('nameserver')) {
            answers.push(line.trim());
          }
        }
        return {
          success: true,
          action: 'nslookup',
          domain,
          record_type: normalizedRecordType,
          server: server || 'default',
          answers,
          raw_output: result.output,
          message: `nslookup for "${domain}" (${normalizedRecordType}) completed`
        };
      }
    }
  }
};
