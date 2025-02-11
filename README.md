<!-- <p align="center">
  <a href="https://github.com/hanseltimeindustries/get-changed-files/actions"><img alt="hanseltimeindustries/get-changed-files status" src="https://github.com/hanseltimeindustries/get-changed-files/workflows/Test/badge.svg"></a>
</p> -->

# Get All Changed Files

Get all of the files changed/modified in a pull request or push's commits.
You can get outputs for all changed files total, added files, modified files, removed files, renamed files, or all added + modified files.
You can also choose to only look for changes matching certain file patterns of interest.
These outputs are available via the `steps` output context.
The `steps` output context exposes the output names `all`, `added`, `modified`, `removed`, `renamed`, and `added_modified`.

## What's different between other actions?

This action is meant to not rely on a correctly configured `git` client (which is mainly what I found).  
This action doesn't even require a `checkout` to run since it only uses github event context and the github compare API.  This also means that fork pull requests are also supported!

Additionally, this is the spiritual successor to https://github.com/jitterbit/get-changed-files, which had the same aims but has not been kept up to date with APIS.  You can consider this a replacement for that action if you already liked it in your workflows.

- [Get All Changed Files](#get-all-changed-files)
  - [What's different between other actions?](#whats-different-between-other-actions)
- [Usage](#usage)
  - [Arguments](#arguments)
    - [format](#format)
    - [filter](#filter)
  - [Permissions](#permissions)
- [Scenarios](#scenarios)
  - [Get all changed files as space-delimited](#get-all-changed-files-as-space-delimited)
  - [Get all added and modified files as CSV](#get-all-added-and-modified-files-as-csv)
  - [Get all removed files as JSON](#get-all-removed-files-as-json)
  - [Check to see if disallowed files are in the commit](#check-to-see-if-disallowed-files-are-in-the-commit)
- [License](#license)
- [Development](#development)
<!-- created with markdown all in one Vscode extension -->

# Usage

See [action.yml](action.yml)

```yaml
- uses: hanseltimeindustries/get-changed-files@v1
  with:
    # Format of the steps output context.
    # Can be 'space-delimited', 'csv', or 'json'.
    # Default: 'space-delimited'
    format: ''
    filter: 'site/**,bundle/**'
```

## Arguments

### format

This argument dictates how each of the output strings are written

| format | description |
| ------ | ----------- |
| space-delimited (default) | `file.txt file2.txt` |
| csv    | `file.txt,file2.txt` |
| json | `[ "file.txt", "file2.txt" ]` |

### filter

This argument will filter the output of files to only those that match the set of provided [minimatch globs](https://github.com/isaacs/minimatch).  It this is not provided, then all changed files are provided.

Example:  `sites/**/*,bundle/**/*`

The above configuration is only returning changed files in the `sites/` and `bundle/` folder.

## Permissions

Since this action uses the [Github Compare API](https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28#compare-two-commits), you will
need to have the minimum permissions for that API.

```yaml
permissions:
  contents: read
```

# Scenarios

## Get all changed files as space-delimited

If there are any files with spaces in them, then this method won't work and the step will fail.
Consider using one of the other formats if that's the case.

```yaml
- id: files
  uses: hanseltimeindustries/get-changed-files@v1
- run: |
    for changed_file in ${{ steps.files.outputs.all }}; do
      echo "Do something with this ${changed_file}."
    done
```

## Get all added and modified files as CSV

```yaml
- id: files
  uses: hanseltimeindustries/get-changed-files@v1
  with:
    format: 'csv'
- run: |
    mapfile -d ',' -t added_modified_files < <(printf '%s,' '${{ steps.files.outputs.added_modified }}')
    for added_modified_file in "${added_modified_files[@]}"; do
      echo "Do something with this ${added_modified_file}."
    done
```

## Get all removed files as JSON

```yaml
- id: files
  uses: hanseltimeindustries/get-changed-files@v1
  with:
    format: 'json'
- run: |
    readarray -t removed_files <<<"$(jq -r '.[]' <<<'${{ steps.files.outputs.removed }}')"
    for removed_file in ${removed_files[@]}; do
      echo "Do something with this ${removed_file}."
    done
```

## Check to see if disallowed files are in the commit

This action uses semantic-release to bundle its code and then commit it onto the master branch.
To avoid someone maliciously injecting some call into their bundle.js, we make use of this action
to throw an error if there are changes in the `bundle/**` directory.

```yaml
      - id: bundle-changed-files
        name: Run the action
        uses: hanseltimeindustries/get-changed-files@v1
        with:
          format: 'space-delimited'
          filter: "bundle/**/*"

      - name: No committed bundle
        if: ${{ steps.bundle-changed-files.outputs.all }}
        run: |
          echo "all files in bundle/ directory are committed by the release process.  Please make sure not to commit your bundle files!"
          exit 1
```

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)

# Development

[Development](./DEVELOPMENT.md)