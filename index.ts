import * as core from '@actions/core';
import * as path from 'path';
import * as fs from 'fs';
import archiver from 'archiver';
import { glob } from 'glob';
import axios from 'axios';
import FormData from 'form-data';

const source = '.';
export const authUrl = 'https://kernl.us/api/v1/auth';
export const deploymentURL = 'https://kernl.us/api/v1/plugins/';

export async function run(): Promise<void> {
    try {
        const pluginId = core.getInput('plugin-id');
        const pluginSlug = core.getInput('plugin-slug');

        const kernlToken = await getKernlToken();
        const zipFile = await zipDirectory(pluginSlug);
        const version = getVersionFromFile();
        const changelogEntry = getChangelogEntry(version);

        await deployToKernl(kernlToken, pluginId, zipFile, version, changelogEntry);

        core.setOutput('zip-path', zipFile);
    } catch (error) {
        core.setFailed((error as Error).message);
    }
}

export async function getKernlToken(): Promise<string> {
    const username = core.getInput('kernl-username');
    const password = core.getInput('kernl-password');
    const response = await axios.post<string>(authUrl, {
        email: username,
        password: password
    });

    return response.data;
}

export function getVersionFromFile(): string {
    return fs.readFileSync('kernl.version', 'utf8').trim();
}

export type ChangelogEntry = {
    description: string;
    requires?: string;
    tested?: string;
};

type ChangelogFile = Record<string, Partial<ChangelogEntry> | undefined>;

export function getChangelogEntry(version: string): ChangelogEntry {
    const changelog = JSON.parse(fs.readFileSync('changelog.json', 'utf8')) as ChangelogFile;
    const entry = changelog[version];
    return {
        description: entry?.description ?? '',
        requires: entry?.requires,
        tested: entry?.tested,
    };
}

export async function zipDirectory(pluginSlug: string): Promise<string> {
    const out = `./${pluginSlug}.zip`;
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(out);
    const ignoreFiles = getIgnoreFiles();

    const files = await glob(`${source}/**/*`, { ignore: ignoreFiles });

    return new Promise<string>((resolve, reject) => {
        stream.on('close', () => resolve(out));
        archive.on('error', err => reject(err));
        archive.pipe(stream);

        for (const file of files) {
            const relativePath = path.relative(source, file);
            const nameInZip = path.join(pluginSlug, relativePath);
            archive.file(file, { name: nameInZip });
        }

        archive.finalize().catch(reject);
    });
}

export function getIgnoreFiles(): string[] {
    const ignore = getFilesFrom('.kernlignore');
    return [...ignore, 'DOCKER_ENV', 'docker_tag', 'output.log', '*.zip'];
}

export function getFilesFrom(file: string): string[] {
    return fs.readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .filter(line => !line.startsWith('#'))
        .map(line => line.replace(/\s/g, ''));
}

export async function deployToKernl(token: string, pluginId: string, zipFile: string, version: string, changelogEntry: ChangelogEntry): Promise<void> {
    const url = `${deploymentURL}${pluginId}/versions`;

    const form = new FormData();
    form.append('changelog', changelogEntry.description);
    form.append('fileSize', '0');
    form.append('s3Url', '');
    form.append('version', version);
    if (changelogEntry.requires) {
        form.append('requires', changelogEntry.requires);
    }
    if (changelogEntry.tested) {
        form.append('tested', changelogEntry.tested);
    }
    form.append('file', fs.createReadStream(zipFile), {
        filename: path.basename(zipFile),
        contentType: 'application/zip'
    });

    try {
        const response = await axios.post(url, form, getAuthHeaders(form, token));

        if (response.status === 201) {
            console.log(response.data);
        } else {
            console.error(`Unexpected HTTP status: ${response.status}`);
        }
    } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
    }
}

export function getAuthHeaders(form: FormData, token: string) {
    return {
        headers: {
            ...form.getHeaders(),
            'Authorization': `Bearer ${token}`
        },
    };
}

if (require.main === module) {
    void run();
}
