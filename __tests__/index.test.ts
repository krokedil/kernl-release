import { EventEmitter } from 'events';
import { Readable } from 'stream';

jest.mock('fs', () => ({
    readFileSync: jest.fn(),
    createReadStream: jest.fn(),
    createWriteStream: jest.fn(),
    promises: {},
}));
jest.mock('@actions/core', () => ({
    getInput: jest.fn(),
    setOutput: jest.fn(),
    setFailed: jest.fn(),
}));
jest.mock('axios', () => ({
    __esModule: true,
    default: { post: jest.fn() },
}));
jest.mock('glob', () => ({
    glob: jest.fn(),
}));
jest.mock('archiver', () => ({
    __esModule: true,
    default: jest.fn(),
}));

import * as fs from 'fs';
import * as core from '@actions/core';
import axios from 'axios';
import { glob } from 'glob';
import archiver from 'archiver';
import FormData from 'form-data';

import {
    run,
    getKernlToken,
    getVersionFromFile,
    getChangelogEntry,
    getIgnoreFiles,
    getFilesFrom,
    deployToKernl,
    getAuthHeaders,
    authUrl,
    deploymentURL,
} from '../index';

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedCore = core as jest.Mocked<typeof core>;
const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedGlob = glob as unknown as jest.Mock;
const mockedArchiver = archiver as unknown as jest.Mock;

describe('getKernlToken', () => {
    it('posts credentials and returns the token from the response', async () => {
        mockedCore.getInput.mockImplementation((name: string) => {
            if (name === 'kernl-username') return 'alice';
            if (name === 'kernl-password') return 'hunter2';
            return '';
        });
        mockedAxios.post.mockResolvedValueOnce({ data: 'token-abc' });

        const token = await getKernlToken();

        expect(mockedAxios.post).toHaveBeenCalledWith(authUrl, {
            email: 'alice',
            password: 'hunter2',
        });
        expect(token).toBe('token-abc');
    });
});

describe('getVersionFromFile', () => {
    it('reads kernl.version and trims whitespace', () => {
        mockedFs.readFileSync.mockReturnValueOnce('  1.2.3 \n' as unknown as Buffer);

        expect(getVersionFromFile()).toBe('1.2.3');
        expect(mockedFs.readFileSync).toHaveBeenCalledWith('kernl.version', 'utf8');
    });
});

describe('getChangelogEntry', () => {
    it('returns the full entry including requires and tested when present', () => {
        mockedFs.readFileSync.mockReturnValueOnce(
            JSON.stringify({
                '1.2.3': {
                    description: 'a fix',
                    requires: '5.9.0',
                    tested: '6.4.2',
                },
            }) as unknown as Buffer,
        );

        expect(getChangelogEntry('1.2.3')).toEqual({
            description: 'a fix',
            requires: '5.9.0',
            tested: '6.4.2',
        });
    });

    it('returns the description with undefined requires/tested when those fields are absent', () => {
        mockedFs.readFileSync.mockReturnValueOnce(
            JSON.stringify({ '1.2.3': { description: 'a fix' } }) as unknown as Buffer,
        );

        expect(getChangelogEntry('1.2.3')).toEqual({
            description: 'a fix',
            requires: undefined,
            tested: undefined,
        });
    });

    it('returns an empty entry when the version is missing', () => {
        mockedFs.readFileSync.mockReturnValueOnce(
            JSON.stringify({ '9.9.9': { description: 'other' } }) as unknown as Buffer,
        );

        expect(getChangelogEntry('1.2.3')).toEqual({
            description: '',
            requires: undefined,
            tested: undefined,
        });
    });
});

describe('getFilesFrom', () => {
    it('parses lines, drops blanks/comments, and strips whitespace', () => {
        mockedFs.readFileSync.mockReturnValueOnce(
            '# a comment\nfoo\n  bar baz\n\n# another\nqux\n' as unknown as Buffer,
        );

        expect(getFilesFrom('.kernlignore')).toEqual(['foo', 'barbaz', 'qux']);
    });
});

describe('getIgnoreFiles', () => {
    it('combines .kernlignore entries with the built-in defaults', () => {
        mockedFs.readFileSync.mockReturnValueOnce('foo\nbar\n' as unknown as Buffer);

        expect(getIgnoreFiles()).toEqual([
            'foo',
            'bar',
            'DOCKER_ENV',
            'docker_tag',
            'output.log',
            '*.zip',
        ]);
    });
});

describe('getAuthHeaders', () => {
    it('merges form headers with the bearer token', () => {
        const fakeForm = {
            getHeaders: () => ({ 'content-type': 'multipart/form-data; boundary=xyz' }),
        } as unknown as FormData;

        expect(getAuthHeaders(fakeForm, 'tok')).toEqual({
            headers: {
                'content-type': 'multipart/form-data; boundary=xyz',
                Authorization: 'Bearer tok',
            },
        });
    });
});

describe('deployToKernl', () => {
    let appendSpy: jest.SpyInstance;

    beforeEach(() => {
        mockedFs.createReadStream.mockReturnValue(Readable.from(['x']) as unknown as fs.ReadStream);
        appendSpy = jest.spyOn(FormData.prototype, 'append');
    });

    afterEach(() => {
        appendSpy.mockRestore();
    });

    /** Returns the value passed to `form.append(fieldName, ...)`, or undefined if never called for that field. */
    function appendedValueFor(fieldName: string): unknown {
        const call = appendSpy.mock.calls.find(args => args[0] === fieldName);
        return call?.[1];
    }

    it('posts to the correct versions URL on success', async () => {
        mockedAxios.post.mockResolvedValueOnce({ status: 201, data: { ok: true } });

        await deployToKernl('tok', 'plug-1', './slug.zip', '1.0.0', { description: 'changes' });

        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        const [calledUrl, calledForm, calledConfig] = mockedAxios.post.mock.calls[0];
        expect(calledUrl).toBe(`${deploymentURL}plug-1/versions`);
        expect(calledForm).toBeInstanceOf(FormData);
        expect((calledConfig as { headers: Record<string, string> }).headers.Authorization)
            .toBe('Bearer tok');
    });

    it('sends fileSize as "0" and s3Url as "" so Kernl populates them server-side', async () => {
        mockedAxios.post.mockResolvedValueOnce({ status: 201, data: { ok: true } });

        await deployToKernl('tok', 'plug-1', './slug.zip', '1.0.0', { description: 'changes' });

        expect(appendedValueFor('fileSize')).toBe('0');
        expect(appendedValueFor('s3Url')).toBe('');
    });

    it('appends requires and tested when both are provided in the changelog entry', async () => {
        mockedAxios.post.mockResolvedValueOnce({ status: 201, data: { ok: true } });

        await deployToKernl('tok', 'plug-1', './slug.zip', '1.0.0', {
            description: 'changes',
            requires: '5.9.0',
            tested: '6.4.2',
        });

        expect(appendedValueFor('changelog')).toBe('changes');
        expect(appendedValueFor('requires')).toBe('5.9.0');
        expect(appendedValueFor('tested')).toBe('6.4.2');
    });

    it('omits requires and tested when they are not in the changelog entry', async () => {
        mockedAxios.post.mockResolvedValueOnce({ status: 201, data: { ok: true } });

        await deployToKernl('tok', 'plug-1', './slug.zip', '1.0.0', { description: 'changes' });

        expect(appendedValueFor('changelog')).toBe('changes');
        expect(appendedValueFor('requires')).toBeUndefined();
        expect(appendedValueFor('tested')).toBeUndefined();
    });

    it('appends only requires when tested is missing', async () => {
        mockedAxios.post.mockResolvedValueOnce({ status: 201, data: { ok: true } });

        await deployToKernl('tok', 'plug-1', './slug.zip', '1.0.0', {
            description: 'changes',
            requires: '5.9.0',
        });

        expect(appendedValueFor('requires')).toBe('5.9.0');
        expect(appendedValueFor('tested')).toBeUndefined();
    });

    it('logs an error when the response status is not 201', async () => {
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        mockedAxios.post.mockResolvedValueOnce({ status: 500, data: 'oops' });

        await deployToKernl('tok', 'plug-1', './slug.zip', '1.0.0', { description: 'changes' });

        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Unexpected HTTP status: 500'));
        errSpy.mockRestore();
    });

    it('logs an error when the request throws', async () => {
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        mockedAxios.post.mockRejectedValueOnce(new Error('boom'));

        await deployToKernl('tok', 'plug-1', './slug.zip', '1.0.0', { description: 'changes' });

        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Error: boom'));
        errSpy.mockRestore();
    });
});

describe('run (integration)', () => {
    function setupHappyPath() {
        mockedCore.getInput.mockImplementation((name: string) => {
            switch (name) {
                case 'plugin-id': return 'plug-1';
                case 'plugin-slug': return 'my-plugin';
                case 'kernl-username': return 'alice';
                case 'kernl-password': return 'hunter2';
                default: return '';
            }
        });

        mockedFs.readFileSync.mockImplementation((file: unknown) => {
            if (file === '.kernlignore') return 'ignored\n' as unknown as Buffer;
            if (file === 'kernl.version') return '1.2.3\n' as unknown as Buffer;
            if (file === 'changelog.json') {
                return JSON.stringify({
                    '1.2.3': {
                        description: 'a fix',
                        requires: '5.9.0',
                        tested: '6.4.2',
                    },
                }) as unknown as Buffer;
            }
            return '' as unknown as Buffer;
        });
        mockedFs.createReadStream.mockReturnValue(Readable.from(['x']) as unknown as fs.ReadStream);

        const writeStream = new EventEmitter();
        mockedFs.createWriteStream.mockReturnValue(writeStream as unknown as fs.WriteStream);

        const fakeArchive = {
            on: jest.fn().mockReturnThis(),
            pipe: jest.fn().mockReturnThis(),
            file: jest.fn().mockReturnThis(),
            finalize: jest.fn().mockImplementation(() => {
                process.nextTick(() => writeStream.emit('close'));
                return Promise.resolve();
            }),
        };
        mockedArchiver.mockReturnValue(fakeArchive);

        mockedGlob.mockResolvedValue(['./a.txt', './b.txt']);

        mockedAxios.post
            .mockResolvedValueOnce({ data: 'token-abc' }) // auth
            .mockResolvedValueOnce({ status: 201, data: { ok: true } }); // deploy

        return { fakeArchive, writeStream };
    }

    it('runs the happy path and sets the zip-path output', async () => {
        const { fakeArchive } = setupHappyPath();
        const appendSpy = jest.spyOn(FormData.prototype, 'append');

        await run();

        expect(mockedCore.setFailed).not.toHaveBeenCalled();
        expect(mockedCore.setOutput).toHaveBeenCalledWith('zip-path', './my-plugin.zip');
        expect(fakeArchive.file).toHaveBeenCalledTimes(2);
        expect(fakeArchive.finalize).toHaveBeenCalledTimes(1);

        // The requires/tested values from changelog.json should flow all the way through to the form.
        const appendedFields = Object.fromEntries(
            appendSpy.mock.calls.map(args => [args[0], args[1]]),
        );
        expect(appendedFields.requires).toBe('5.9.0');
        expect(appendedFields.tested).toBe('6.4.2');

        appendSpy.mockRestore();
    });

    it('calls setFailed when an error is thrown', async () => {
        mockedCore.getInput.mockImplementation((name: string) => {
            if (name === 'plugin-id') return 'plug-1';
            if (name === 'plugin-slug') return 'my-plugin';
            return '';
        });
        mockedAxios.post.mockRejectedValueOnce(new Error('auth failed'));

        await run();

        expect(mockedCore.setFailed).toHaveBeenCalledWith('auth failed');
    });
});
