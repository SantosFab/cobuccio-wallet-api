import { deepMergeConfig } from './config';

describe('deepMergeConfig', () => {
  it('preserves sibling fields the override does not repeat', () => {
    const base = {
      Database: {
        type: 'postgres',
        synchronize: false,
        host: 'localhost',
      },
    };

    const result = deepMergeConfig(base, { Database: { host: 'postgres' } });

    expect(result).toEqual({
      Database: {
        type: 'postgres',
        synchronize: false,
        host: 'postgres',
      },
    });
  });

  it('lets the override replace a top-level primitive', () => {
    const base = { Port: 3000 };

    const result = deepMergeConfig(base, { Port: 4000 });

    expect(result.Port).toBe(4000);
  });

  it('merges multiple levels of nesting independently', () => {
    const base = {
      Database: { host: 'localhost', port: 5432 },
      Auth: { jwtSecret: 'dev', jwtLifetime: 60 },
    };

    const result = deepMergeConfig(base, {
      Database: { host: 'postgres' },
    });

    expect(result).toEqual({
      Database: { host: 'postgres', port: 5432 },
      Auth: { jwtSecret: 'dev', jwtLifetime: 60 },
    });
  });

  it('does not mutate the base object', () => {
    const base = { Database: { host: 'localhost' } };

    deepMergeConfig(base, { Database: { host: 'postgres' } });

    expect(base.Database.host).toBe('localhost');
  });
});
