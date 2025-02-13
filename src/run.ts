import * as core from "@actions/core";
import type { context as _context, getOctokit } from "@actions/github";
import micromatch from "micromatch";

export type Format = "space-delimited" | "csv" | "json";
type FileStatus = "added" | "modified" | "removed" | "renamed";

interface MinUser {
	login: string;
	id: string;
	name?: string;
}

interface MinHead {
	ref: string;
	repo: {
		name: string;
		owner: MinUser;
	};
	user: MinUser;
}

export interface RunOptions {
	format: Format;
	/**
	 * CSV string of minimatch globs
	 */
	filter?: string;
}

export async function run(
	context: typeof _context,
	client: ReturnType<typeof getOctokit>,
	options: RunOptions,
): Promise<void> {
	try {
		// Create GitHub client with the API token.
		const { format, filter } = options;

		// Ensure that the format parameter is set properly.
		if (format !== "space-delimited" && format !== "csv" && format !== "json") {
			core.setFailed(
				`Format must be one of 'string-delimited', 'csv', or 'json', got '${format}'.`,
			);
			return;
		}

		// Debug log the payload.
		core.debug(`Payload keys: ${Object.keys(context.payload)}`);

		// Get event name.
		const eventName = context.eventName;

		// Define the base and head commits to be extracted from the payload.
		let base: string | undefined;
		let head: string | undefined;

		// Per the "in network" docs, this will add a username if it's a fork
		let usernameModifier = "";
		let ownerModifier = "";
		switch (eventName) {
			case "pull_request":
				{
					base = context.payload.pull_request?.base?.ref;
					head = context.payload.pull_request?.head?.ref;
					const { head: headObj } = context.payload
						.pull_request! as unknown as {
						head: MinHead;
					};
					const headOwnerName =
						headObj.repo.owner.login ?? headObj.repo.owner.name;
					if (!headOwnerName) {
						core.setFailed(
							`This action could not find the owner name of the head ${head}. ` +
								"Please submit an issue on this action's GitHub repo if you believe this in correct.",
						);
						return;
					}
					if (
						headOwnerName.toLowerCase() !== context.repo.owner.toLowerCase() ||
						headObj.repo.name.toLowerCase() !== context.repo.repo.toLowerCase()
					) {
						usernameModifier = `${headOwnerName}:`;
						ownerModifier = `${context.repo.owner}:`;
					}
				}
				break;
			case "push":
				base = context.payload.before;
				head = context.payload.after;
				break;
			default:
				core.setFailed(
					`This action only supports pull requests and pushes, ${context.eventName} events are not supported. ` +
						"Please submit an issue on this action's GitHub repo if you believe this in correct.",
				);
				return;
		}

		// Log the base and head commits
		core.info(`Base commit: ${base}`);
		core.info(`Head commit: ${head}`);

		// Ensure that the base and head properties are set on the payload.
		if (!base || !head) {
			core.setFailed(
				`The base and head commits are missing from the payload for this ${context.eventName} event. ` +
					"Please submit an issue on this action's GitHub repo.",
			);

			// To satisfy TypeScript, even though this is unreachable.
			base = "";
			head = "";
		}

		const comparePayload = {
			owner: context.repo.owner,
			repo: context.repo.repo,
			basehead: `${ownerModifier}${base}...${usernameModifier}${head}`,
			// note - pagination bypasses the large commit limitation but still returns all files only on the first page per documentation
			// eslint-disable-next-line @typescript-eslint/camelcase
			per_page: 250,
			page: 1,
		};

		core.debug(`Compare Payload ${JSON.stringify(comparePayload, null, 4)}`);

		// Use GitHub's compare two commits API.
		// https://developer.github.com/v3/repos/commits/#compare-two-commits
		const response =
			await client.rest.repos.compareCommitsWithBasehead(comparePayload);

		// Ensure that the request was successful.
		if (response.status !== 200) {
			core.setFailed(
				`The GitHub API for comparing the base and head commits for this ${context.eventName} event returned ${response.status}, expected 200. ` +
					"Please submit an issue on this action's GitHub repo.",
			);
			return;
		}

		// Ensure that the head commit is ahead of the base commit.
		if (response.data.status !== "ahead") {
			core.setFailed(
				`The head commit for this ${context.eventName} event is not ahead of the base commit. ` +
					"Please ensure your changes are on top of the base branch so that comparison is accurate.",
			);
			return;
		}

		// Get the changed files from the response payload.
		let files = response.data.files ?? [];
		if (filter) {
			const origCount = files.length;
			// Allow whitespace
			const normalizedFilters = filter.split(",").map((fil) => fil.trim());
			core.info(`Filtering files to match ${filter}`);
			files = files.filter((f) =>
				micromatch.isMatch(f.filename, normalizedFilters),
			);
			core.info(`Filtered out ${origCount - files.length} files`);
		}
		const all = [] as string[],
			added = [] as string[],
			modified = [] as string[],
			removed = [] as string[],
			renamed = [] as string[],
			addedModified = [] as string[];
		for (const file of files) {
			const filename = file.filename;
			// If we're using the 'space-delimited' format and any of the filenames have a space in them,
			// then fail the step.
			if (format === "space-delimited" && filename.includes(" ")) {
				core.setFailed(
					`One of your files includes a space (${filename}). Consider using a different output format or removing spaces from your filenames. ` +
						"Please submit an issue on this action's GitHub repo.",
				);
				return;
			}
			all.push(filename);
			switch (file.status as FileStatus) {
				case "added":
					added.push(filename);
					addedModified.push(filename);
					break;
				case "modified":
					modified.push(filename);
					addedModified.push(filename);
					break;
				case "removed":
					removed.push(filename);
					break;
				case "renamed":
					renamed.push(filename);
					break;
				default:
					core.setFailed(
						`One of your files includes an unsupported file status '${file.status}' for '${filename}', expected 'added', 'modified', 'removed', or 'renamed'.`,
					);
					return;
			}
		}

		// Format the arrays of changed files.
		let allFormatted: string,
			addedFormatted: string,
			modifiedFormatted: string,
			removedFormatted: string,
			renamedFormatted: string,
			addedModifiedFormatted: string;
		switch (format) {
			case "space-delimited":
				// If any of the filenames have a space in them, then fail the step.
				for (const file of all) {
					if (file.includes(" "))
						core.setFailed(
							`One of your files includes a space. Consider using a different output format or removing spaces from your filenames.`,
						);
				}
				allFormatted = all.join(" ");
				addedFormatted = added.join(" ");
				modifiedFormatted = modified.join(" ");
				removedFormatted = removed.join(" ");
				renamedFormatted = renamed.join(" ");
				addedModifiedFormatted = addedModified.join(" ");
				break;
			case "csv":
				allFormatted = all.join(",");
				addedFormatted = added.join(",");
				modifiedFormatted = modified.join(",");
				removedFormatted = removed.join(",");
				renamedFormatted = renamed.join(",");
				addedModifiedFormatted = addedModified.join(",");
				break;
			case "json":
				allFormatted = JSON.stringify(all);
				addedFormatted = JSON.stringify(added);
				modifiedFormatted = JSON.stringify(modified);
				removedFormatted = JSON.stringify(removed);
				renamedFormatted = JSON.stringify(renamed);
				addedModifiedFormatted = JSON.stringify(addedModified);
				break;
		}

		// Log the output values.
		core.info(`All: ${allFormatted}`);
		core.info(`Added: ${addedFormatted}`);
		core.info(`Modified: ${modifiedFormatted}`);
		core.info(`Removed: ${removedFormatted}`);
		core.info(`Renamed: ${renamedFormatted}`);
		core.info(`Added or modified: ${addedModifiedFormatted}`);

		// Set step output context.
		core.setOutput("all", allFormatted);
		core.setOutput("added", addedFormatted);
		core.setOutput("modified", modifiedFormatted);
		core.setOutput("removed", removedFormatted);
		core.setOutput("renamed", renamedFormatted);
		core.setOutput("added_modified", addedModifiedFormatted);

		// For backwards-compatibility
		core.setOutput("deleted", removedFormatted);
	} catch (error) {
		core.setFailed(error instanceof Error ? error.message : `${error}`);
	}
}
