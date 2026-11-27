const deployments = {
  preview: {
    name: 'onyx-pacificacrm',
    origin: 'https://onyx-pacificacrm.pacificalegalinsurance.workers.dev',
    workers_dev: true,
  },
  production: {
    name: 'onyx-pacificacrm-production',
    origin: 'https://pacificacrm.com',
    workers_dev: false,
  },
};

export function preparePacificaRelease(input, environment, commit, branch, flags = {}) {
  if (!Object.hasOwn(deployments, environment)) throw Error('Choose the preview or production deployment.');
  if (!/^[a-f0-9]{40}$/.test(commit ?? '') || !branch)
    throw Error('The build must identify the Git commit and branch being deployed.');
  if (input.assets?.binding !== 'ASSETS' || input.assets.directory !== '../client')
    throw Error('The generated Worker configuration must bind the compiled client assets.');

  const deployment = deployments[environment];
  const config = structuredClone(input);
  config.name = deployment.name;
  config.workers_dev = deployment.workers_dev;
  config.preview_urls = false;
  config.keep_vars = true;

  // Only the production target may honor an explicit scheduler opt-in.
  const gmailCron = environment === 'production' && flags.gmailCron === true;
  const connectedCron = environment === 'production' && flags.connectedCron === true;
  config.triggers = { crons: gmailCron || connectedCron ? ['*/5 * * * *'] : [] };
  config.vars = {
    ...config.vars,
    ONYX_ENV: environment,
    ONYX_URL: deployment.origin,
    ONYX_BRANCH: branch,
    ONYX_COMMIT_SHA: commit,
    PACIFICA_GMAIL_CRON_ENABLED: String(gmailCron),
    PACIFICA_CONNECTED_SYNC_ENABLED: String(connectedCron),
  };

  if (environment === 'preview') {
    // This is an offline pilot. Provider secrets and callbacks require an independently
    // configured staging target; release JSON must not embed outbound provider settings.
    const unsafeVars = Object.keys(config.vars).filter(name =>
      /^(TWILIO_|RESEND_API_KEY$|PACIFICA_EMAIL_WEBHOOK_|PACIFICA_GMAIL_|PACIFICA_CONNECTED_GOOGLE_CLIENT_SECRET$)/.test(name) &&
      !['PACIFICA_GMAIL_CRON_ENABLED'].includes(name));
    if (unsafeVars.length) throw Error('Preview Worker configuration contains provider variables; use isolated target bindings.');
    config.vars.NEXT_PUBLIC_APP_URL = deployment.origin;
    config.vars.PACIFICA_HOSTING = 'cloudflare';
    config.vars.PACIFICA_SMS_SENDING_ENABLED = 'false';
  } else {
    config.vars.NEXT_PUBLIC_APP_URL = deployment.origin;
    config.vars.PACIFICA_HOSTING = 'cloudflare';
    config.vars.PACIFICA_SMS_SENDING_ENABLED = 'false';
  }
  return config;
}
