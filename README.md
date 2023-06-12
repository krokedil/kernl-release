# Kernl Deployment Action

This action deploys the current plugin to Kernl. It has been designed to provide a seamless integration between your GitHub repositories and Kernl, a platform for managing WordPress plugin and theme updates. This can be used for plugins that has a build processes that requires either a composer or npm setup to build a release version of the plugin, something that is not supported by the CD integration provided by Kernl directly. Run any build steps required before running this action.

## Inputs

- `plugin-id`: The plugin ID from Kernl. It is the same as the id used by the update checker. **This is a required input.**

- `plugin-slug`: The plugin slug. This will be used for the zip file name and the plugin folder name. **This is a required input.**

- `kernl-username`: Your Kernl username. This is necessary to authenticate your Kernl account. **This is a required input.**

- `kernl-password`: Your Kernl password. This is necessary to authenticate your Kernl account. **This is a required input.**

## Outputs

The action produces the following output:

- `zip-path`: The path of the zip file generated as part of the deployment process. This can be used in subsequent steps if needed.

## Usage

The deployment process will use the kernl files kernl.version, .kernlignore as well as changelog.json to create the deployment to kernl. The action will also create a zip file of the plugin that will be uploaded to Kernl. The zip file will be named using the plugin slug input.

Here is a basic example of how to use the action in your GitHub workflow with a composer and npm build process:

```yaml
name: Deploy release to Kernl.
on:
    release:
        types: [published]
        tags:
            - '*.*.*'
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    # Checkout the repository to the GitHub Actions runner
    - name: Checkout Repository
      uses: actions/checkout@v2

    # Install composer dependencies, not required if you don't have a build process that requires composer.
    - name: Composer Install
      run: composer install --no-dev

    # Install npm dependencies, not required if you don't have a build process that requires npm.
    - name: NPM Install
      run: npm ci

    # Create a zip file and push it to Kernl.
    - name: Kernl Deployment
      id: kernl-deploy
      uses: krokedil/kernl-release@1.0.0
      with:
        plugin-id: 'your-plugin-id'
        plugin-slug: 'your-plugin-slug'
        kernl-username: 'your-kernl-username'
        kernl-password: ${{ secrets.KERNL_PASSWORD }}

    # Add release assets to the Github release tag, not required if you don't want to add the zip file to the release tag, or you are not triggering the action on a release tag.
    - name: Upload release asset
      uses: actions/upload-release-asset@v1
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      with:
        upload_url: ${{ github.event.release.upload_url }}
        asset_path: ${{ steps.kernl-deploy.outputs.zip-path }}
        asset_name: ${{ github.event.repository.name }}.zip
        asset_content_type: application/zip
