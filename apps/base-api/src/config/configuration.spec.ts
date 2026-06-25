import { configuration } from './configuration';

describe('configuration', () => {
  it('should_read_admin_bootstrap_email_from_env', () => {
    process.env.ADMIN_BOOTSTRAP_EMAIL = 'boss@chcooai.com';
    expect(configuration().adminBootstrapEmail).toBe('boss@chcooai.com');
  });
});
