/**
 * Tool: certbot_manage — Manage SSL/TLS certificates with Certbot
 * Risk: CRITICAL (modifies SSL certificates and web server configuration)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'certbot_manage',
  description: 'Manage SSL/TLS certificates on the remote server using Certbot (Let\'s Encrypt). Supports listing certificates, obtaining new certificates, renewing existing certificates, revoking certificates, and viewing detailed certificate information. Use this tool to manage HTTPS/TLS for your domains. All actions are critical as they directly affect the server\'s SSL/TLS configuration and can impact website availability. Requires explicit approval for all actions.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform with Certbot',
        enum: ['list', 'obtain', 'renew', 'revoke', 'certificates']
      },
      domain: {
        type: 'string',
        description: 'Domain name for the certificate (e.g., "example.com", "sub.example.com"). Required for obtain and revoke actions.'
      },
      email: {
        type: 'string',
        description: 'Email address for Let\'s Encrypt registration and recovery. Used with obtain action. Defaults to Certbot\'s configured email if omitted.'
      },
      webroot: {
        type: 'string',
        description: 'Webroot path for the HTTP-01 challenge (e.g., "/var/www/html"). Used with obtain action. If omitted, Certbot will use its standalone mode or nginx/apache plugin.'
      },
      cert_path: {
        type: 'string',
        description: 'Path to the certificate file for revoke action. If omitted, Certbot will attempt to find the certificate by domain name.'
      }
    },
    required: ['action']
  },
  risk_level: 'CRITICAL',
  needs_approval: true,
  category: 'security',

  async implementation(serverConfig, args, context) {
    const { action, domain, email, webroot, cert_path } = args;

    // Validate action
    const validActions = ['list', 'obtain', 'renew', 'revoke', 'certificates'];
    if (!validActions.includes(action)) {
      return {
        success: false,
        error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`
      };
    }

    // Validate domain for actions that require it
    if (['obtain', 'revoke'].includes(action) && !domain) {
      return {
        success: false,
        error: `Action "${action}" requires a domain parameter`
      };
    }

    // Validate domain format
    if (domain) {
      const validDomainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*$/;
      if (!validDomainPattern.test(domain)) {
        return {
          success: false,
          error: `Invalid domain name: ${domain}`
        };
      }
    }

    // Validate email format if provided
    if (email) {
      const validEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!validEmailPattern.test(email)) {
        return {
          success: false,
          error: `Invalid email address: ${email}`
        };
      }
    }

    // Validate webroot path if provided
    if (webroot) {
      const validPathPattern = /^\/[a-zA-Z0-9_\-./]*$/;
      if (!validPathPattern.test(webroot)) {
        return {
          success: false,
          error: `Invalid webroot path: ${webroot}`
        };
      }
    }

    // Validate cert_path if provided
    if (cert_path) {
      const validPathPattern = /^\/[a-zA-Z0-9_\-./]*$/;
      if (!validPathPattern.test(cert_path)) {
        return {
          success: false,
          error: `Invalid certificate path: ${cert_path}`
        };
      }
    }

    let command;

    switch (action) {
      case 'list': {
        command = 'certbot certificates 2>&1';
        break;
      }
      case 'obtain': {
        command = 'certbot certonly --non-interactive --agree-tos';
        if (email) {
          command += ` --email "${email}"`;
        } else {
          command += ' --register-unsafely-without-email';
        }
        if (webroot) {
          command += ` --webroot --webroot-path "${webroot}"`;
        } else {
          // Try nginx plugin first, fall back to standalone
          command += ' --nginx';
        }
        command += ` -d "${domain}" 2>&1`;
        break;
      }
      case 'renew': {
        command = 'certbot renew --non-interactive 2>&1';
        break;
      }
      case 'revoke': {
        if (cert_path) {
          command = `certbot revoke --non-interactive --cert-path "${cert_path}" 2>&1`;
        } else {
          command = `certbot revoke --non-interactive --cert-name "${domain}" 2>&1`;
        }
        break;
      }
      case 'certificates': {
        command = 'certbot certificates 2>&1';
        break;
      }
    }

    const result = await executeCommand(serverConfig, command);

    if (!result.success) {
      // Check for common Certbot errors
      if (result.output?.includes('command not found') || result.output?.includes('certbot: not found')) {
        return {
          success: false,
          error: 'Certbot is not installed on this server. Install it with: apt install certbot python3-certbot-nginx'
        };
      }
      if (result.output?.includes('No certificate found')) {
        return {
          success: false,
          error: 'No certificates found on this server',
          exit_code: result.exit_code
        };
      }
      if (result.output?.includes('Could not find certificate') || result.output?.includes('Certificate not found')) {
        return {
          success: false,
          error: `No certificate found for domain "${domain}"`,
          exit_code: result.exit_code
        };
      }
      if (result.output?.includes('Failed authorization procedure') || result.output?.includes('Challenge failed')) {
        return {
          success: false,
          error: `Domain verification failed for "${domain}". Ensure the domain DNS points to this server and port 80 is accessible.`,
          exit_code: result.exit_code,
          output: result.output
        };
      }
      if (result.output?.includes('too many certificates')) {
        return {
          success: false,
          error: `Rate limit exceeded for domain "${domain}". Let\'s Encrypt has rate limits on certificate issuance. Try again later.`,
          exit_code: result.exit_code
        };
      }
      return {
        success: false,
        error: result.error || `Failed to ${action} certificate`,
        exit_code: result.exit_code,
        output: result.output
      };
    }

    // Process results based on action
    switch (action) {
      case 'list':
      case 'certificates': {
        // Parse certificate information from certbot output
        const certs = [];
        const certBlocks = result.output.split(/(?=Certificate Name:)/);
        for (const block of certBlocks) {
          if (!block.trim()) continue;
          const nameMatch = block.match(/Certificate Name:\s*(.+)/);
          const domainMatch = block.match(/Domains:\s*(.+)/);
          const expiryMatch = block.match(/Expiry Date:\s*(.+)/);
          const pathMatch = block.match(/Certificate Path:\s*(.+)/);
          const keyMatch = block.match(/Private Key Path:\s*(.+)/);

          if (nameMatch) {
            certs.push({
              name: nameMatch[1].trim(),
              domains: domainMatch ? domainMatch[1].trim().split(/\s+/) : [],
              expiry: expiryMatch ? expiryMatch[1].trim() : 'Unknown',
              cert_path: pathMatch ? pathMatch[1].trim() : '',
              key_path: keyMatch ? keyMatch[1].trim() : ''
            });
          }
        }
        return {
          success: true,
          action,
          certificates: certs,
          count: certs.length,
          raw_output: result.output
        };
      }

      case 'obtain':
        return {
          success: true,
          action: 'obtain',
          domain,
          email: email || 'registered without email',
          webroot: webroot || 'nginx plugin',
          message: `SSL certificate obtained successfully for "${domain}"`,
          output: result.output,
          risk_level: 'CRITICAL'
        };

      case 'renew':
        return {
          success: true,
          action: 'renew',
          message: 'Certificate renewal process completed successfully',
          output: result.output,
          risk_level: 'CRITICAL'
        };

      case 'revoke':
        return {
          success: true,
          action: 'revoke',
          domain,
          message: `Certificate for "${domain}" revoked successfully`,
          output: result.output,
          risk_level: 'CRITICAL'
        };
    }
  }
};
