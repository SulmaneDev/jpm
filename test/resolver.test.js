'use strict';

const Resolver = require('../src/core/resolver');
const registry = require('../src/core/registry');

jest.mock('../src/core/registry');

describe('Resolver', () => {
    let resolver;

    beforeEach(() => {
        resolver = new Resolver();
        jest.clearAllMocks();
    });

    test('should resolve a simple dependency', async () => {
        registry.getVersions.mockResolvedValue(['1.0.0']);
        registry.getLatest.mockResolvedValue('1.0.0');
        registry.getVersion.mockResolvedValue({
            name: 'foo',
            version: '1.0.0',
            dist: { tarball: 'http://foo.tgz', shasum: 'abc' },
            dependencies: {}
        });

        const deps = { foo: '1.0.0' };
        const resolved = await resolver.resolve(deps);

        expect(resolved.has('foo@1.0.0')).toBe(true);
        expect(registry.getVersions).toHaveBeenCalledWith('foo');
    });

    test.skip('should handle circular dependencies gracefully', async () => {
        registry.getVersions.mockImplementation(async (name) => ['1.0.0']);
        registry.getVersion.mockImplementation(async (name, version) => {
            if (name === 'a') return { name: 'a', version: '1.0.0', dist: { tarball: 'a.tgz' }, dependencies: { b: '1.0.0' } };
            if (name === 'b') return { name: 'b', version: '1.0.0', dist: { tarball: 'b.tgz' }, dependencies: { a: '1.0.0' } };
            return { name, version, dist: { tarball: 'else.tgz' }, dependencies: {} };
        });

        const deps = { a: '1.0.0' };
        await resolver.resolve(deps);

        const circular = resolver.findCircular();
        expect(circular.length).toBeGreaterThan(0);
        expect(circular[0]).toContain('a → b → a');
    });
});
