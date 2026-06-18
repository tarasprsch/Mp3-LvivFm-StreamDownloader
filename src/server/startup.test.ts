import { describe, expect, it } from 'vitest';
import { describeStartupError } from './startup.js';

describe('startup errors', () => {
  it('explains port conflicts without a raw node stack', () => {
    const error = Object.assign(new Error('listen EADDRINUSE'), {
      code: 'EADDRINUSE',
      address: '0.0.0.0',
      port: 11080
    });

    expect(describeStartupError(error)).toBe(
      [
        'Port 11080 is already in use on 0.0.0.0.',
        'Stop the existing process or change web.port in your data/config.json file, then start the app again.'
      ].join('\n')
    );
  });
});
