import * as core from '@actions/core';
import * as path from 'path';
import * as fs from 'fs';
import archiver from 'archiver';
import { glob } from 'glob';
import axios from 'axios';
import FormData from 'form-data';

const source = '.';
const url = 'https://kernl.us/api/v1/auth';
const deploymentURL = 'https://kernl.us/api/v1/plugins/';

async function run(): Promise<void> {
    try {
        const pluginId = core.getInput('plugin-id');
        const pluginSlug = core.getInput('plugin-slug');

        const kernlToken = await getKernlToken();
        const zipFile = await zipDirectory(pluginSlug);
        const version = getVersionFromFile();
        const changelog = await getChangelog(version);

        await deployToKernl(kernlToken, pluginId, zipFile, version, changelog);

        core.setOutput('zip-path', zipFile);
    } catch (error) {
        core.setFailed((error as Error).message);
    }
}

async function getKernlToken(): Promise<string> {
    const username = core.getInput('kernl-username');
    const password = core.getInput('kernl-password');
    const response = await axios.post(url, {
        email: username,
        password: password
    });

    return response.data;
}

function getVersionFromFile(): string {
    return fs.readFileSync('kernl.version', 'utf8').trim();
}

async function getChangelog(version: string): Promise<string> {
    const changelog = JSON.parse(fs.readFileSync('changelog.json', 'utf8'));
    return changelog[version] ? changelog[version]['description'] : '';
}

async function zipDirectory(pluginSlug: string): Promise<string> {
    const out = `./${pluginSlug}.zip`;
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(out);
    const ignoreFiles = getIgnoreFiles();

    return new Promise<string>(async (resolve, reject) => {
        archive.on('error', err => reject(err)).pipe(stream);
        const files = await glob(`${source}/**/*`, { ignore: ignoreFiles });

        files.forEach(async (file) => {
            const relativePath = path.relative(source, file);
            const nameInZip = path.join(pluginSlug, relativePath);
            archive.file(file, { name: nameInZip });
        });

        await archive.finalize();
        stream.on('close', () => resolve(out));
    });
}

function getIgnoreFiles(): string[] {
    const ignore = getFilesFrom('.kernlignore');
    return [...ignore, 'DOCKER_ENV', 'docker_tag', 'output.log', '*.zip'];
}

function getFilesFrom(file: string): string[] {
    return fs.readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .filter(line => !line.startsWith('#'))
        .map(line => line.replace(/\s/g, ''));
}

async function deployToKernl(token: string, pluginId: string, zipFile: string, version: string, changelog: string): Promise<void> {
    const url = `${deploymentURL}${pluginId}/versions`;

    const form = new FormData();
    form.append('changelog', changelog);
    form.append('fileSize', fs.statSync(zipFile).size.toString());
    form.append('s3Url', 'none');
    form.append('version', version);
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

function getAuthHeaders(form: FormData, token: string) {
    return {
        headers: {
            ...form.getHeaders(),
            'Authorization': `Bearer ${token}`
        },
    };
}

run();
