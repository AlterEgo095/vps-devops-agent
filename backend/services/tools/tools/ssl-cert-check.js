/**
 * Tool: ssl_cert_check — Check SSL certificate for a domain
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'ssl_cert_check',
  description: 'Check the SSL certificate for a domain on the remote server. Returns certificate subject, issuer, validity dates, and days until expiration. Connects to the specified domain and port to retrieve certificate info.',
  parameters: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        description: 'Domain name to check SSL certificate for (e.g., "example.com")'
      },
      port: {
        type: 'number',
        description: 'Port number to connect to',
        default: 443
      }
    },
    required: ['domain']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'security',

  async implementation(serverConfig, args) {
    const { domain, port = 443 } = args;

    if (!domain) {
      return {
        success: false,
        error: 'domain is required'
      };
    }

    // Validate domain name
    const validDomainPattern = /^[a-zA-Z0-9][a-zA-Z0-9.\-]*$/;
    if (!validDomainPattern.test(domain)) {
      return {
        success: false,
        error: `Invalid domain name: ${domain}`
      };
    }

    // Validate port
    const safePort = Math.min(Math.max(Math.floor(port), 1), 65535);

    // Get certificate info using openssl
    const certResult = await executeCommand(
      serverConfig,
      `echo | openssl s_client -connect ${domain}:${safePort} -servername ${domain} 2>/dev/null | openssl x509 -noout -dates -subject -issuer 2>&1`
    );

    if (!certResult.success || !certResult.output) {
      return {
        success: false,
        error: `Failed to retrieve SSL certificate for ${domain}:${safePort}. The domain may not be reachable or may not have SSL configured.`,
        domain,
        port: safePort
      };
    }

    // Parse the certificate output
    const output = certResult.output;
    let subject = '';
    let issuer = '';
    let notBefore = '';
    let notAfter = '';
    let daysRemaining = null;

    const lines = output.split('\n');
    for (const line of lines) {
      if (line.startsWith('subject=')) {
        subject = line.replace('subject=', '').trim();
      } else if (line.startsWith('issuer=')) {
        issuer = line.replace('issuer=', '').trim();
      } else if (line.startsWith('notBefore=')) {
        notBefore = line.replace('notBefore=', '').trim();
      } else if (line.startsWith('notAfter=')) {
        notAfter = line.replace('notAfter=', '').trim();
      }
    }

    // Calculate days until expiration
    if (notAfter) {
      try {
        const expiryDate = new Date(notAfter);
        const now = new Date();
        daysRemaining = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
      } catch {
        // Keep daysRemaining as null
      }
    }

    // Also get the full certificate chain info
    const chainResult = await executeCommand(
      serverConfig,
      `echo | openssl s_client -connect ${domain}:${safePort} -servername ${domain} 2>/dev/null | openssl x509 -noout -text 2>&1 | grep -A2 "Subject Alternative Name" || true`
    );

    return {
      success: true,
      domain,
      port: safePort,
      subject,
      issuer,
      not_before: notBefore,
      not_after: notAfter,
      days_remaining: daysRemaining,
      is_expired: daysRemaining !== null && daysRemaining < 0,
      is_expiring_soon: daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 30,
      alternative_names: chainResult.success ? chainResult.output.trim() : undefined
    };
  }
};
