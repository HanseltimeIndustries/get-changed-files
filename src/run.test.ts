import { setFailed, setOutput } from "@actions/core";
import { Format, run } from "./run";

jest.mock("@actions/core");

const mockSetFailed = jest.mocked(setFailed);
const mockSetOutput = jest.mocked(setOutput);
const mockCompareCommitsWithBaseHead = jest.fn();

const baseContext = {
	repo: {
		owner: "hanseltimeindustries",
		repo: "my-awesome-repo",
	},
};
const mockOctoKit = {
	rest: {
		repos: {
			compareCommitsWithBasehead: mockCompareCommitsWithBaseHead,
		},
	},
};

const mockPullRequestPayload = {
	pull_request: {
		base: {
			sha: "baseSha",
			ref: "master",
		},
		head: {
			sha: "headSha",
			ref: "mything",
			repo: {
				owner: {
					login: baseContext.repo.owner,
					name: baseContext.repo.owner,
				},
				name: baseContext.repo.repo,
			},
		},
	},
};

const mockPushPayload = {
	before: "beforeSha",
	after: "afterSha",
};

beforeEach(() => {
	jest.resetAllMocks();
});

it("setsFailed if the format is not accounted for", async () => {
	const opts = {
		format: "unsupported format" as any,
	};

	await run({} as any, mockOctoKit as any, opts);

	expect(mockSetFailed).toHaveBeenCalledWith(
		`Format must be one of 'string-delimited', 'csv', or 'json', got 'unsupported format'.`,
	);
	expect(mockSetOutput).toHaveBeenCalledTimes(0);
});

it("setsFailed if the event is not accounted for", async () => {
	const opts = {
		format: "json" as any,
	};

	await run(
		{
			...baseContext,
			eventName: "something",
			payload: {}, // required since we serialize this for debug
		} as any,
		mockOctoKit as any,
		opts,
	);

	expect(mockSetFailed).toHaveBeenCalledWith(
		`This action only supports pull requests and pushes, something events are not supported. Please submit an issue on this action's GitHub repo if you believe this in correct.`,
	);
	expect(mockSetOutput).toHaveBeenCalledTimes(0);
});

it("setsFailed if it can't determine head and base sha's", async () => {
	const opts = {
		format: "json" as any,
	};

	await run(
		{
			...baseContext,
			eventName: "push",
			payload: {
				before: "something",
				after: undefined,
			}, // required since we serialize this for debug
		} as any,
		mockOctoKit as any,
		opts,
	);

	expect(mockSetFailed).toHaveBeenCalledWith(
		`The base and head commits are missing from the payload for this push event. ` +
			"Please submit an issue on this action's GitHub repo.",
	);
	expect(mockSetOutput).toHaveBeenCalledTimes(0);
});

it("setsFailed if the response if not 200", async () => {
	const opts = {
		format: "json" as any,
	};

	mockCompareCommitsWithBaseHead.mockResolvedValue({
		status: 401,
		data: {},
	});

	await run(
		{
			...baseContext,
			eventName: "push",
			payload: {
				before: "something",
				after: "something2",
			}, // required since we serialize this for debug
		} as any,
		mockOctoKit as any,
		opts,
	);

	expect(mockSetFailed).toHaveBeenCalledWith(
		`The GitHub API for comparing the base and head commits for this push event returned 401, expected 200. Please submit an issue on this action's GitHub repo.`,
	);
	expect(mockSetOutput).toHaveBeenCalledTimes(0);
});

it.each([["diverged"], ["behind"], ["identical"]])(
	"setsFailed if the response if the head is not ahead of the base (%s)",
	async (status) => {
		const opts = {
			format: "json" as any,
		};

		mockCompareCommitsWithBaseHead.mockResolvedValue({
			status: 200,
			data: {
				status,
			},
		});

		await run(
			{
				...baseContext,
				eventName: "push",
				payload: {
					before: "something",
					after: "something2",
				}, // required since we serialize this for debug
			} as any,
			mockOctoKit as any,
			opts,
		);

		expect(mockSetFailed).toHaveBeenCalledWith(
			`The head commit for this push event is not ahead of the base commit. ` +
				"Please ensure your changes are on top of the base branch so that comparison is accurate.",
		);
		expect(mockSetOutput).toHaveBeenCalledTimes(0);
	},
);

it("setsFailed if the a file has a space in its name and is space-delimited output", async () => {
	const opts = {
		format: "space-delimited" as any,
	};

	mockCompareCommitsWithBaseHead.mockResolvedValue({
		status: 200,
		data: {
			status: "ahead",
			files: [
				{
					filename: "file.txt",
					status: "modified",
				},
				{
					filename: "dir/file2.txt",
					status: "removed",
				},
				{
					filename: "dir3/file with space.js",
					status: "added",
				},
			],
		},
	});

	await run(
		{
			...baseContext,
			eventName: "push",
			payload: {
				before: "something",
				after: "something2",
			}, // required since we serialize this for debug
		} as any,
		mockOctoKit as any,
		opts,
	);

	expect(mockSetFailed).toHaveBeenCalledWith(
		`One of your files includes a space (dir3/file with space.js). Consider using a different output format or removing spaces from your filenames. ` +
			"Please submit an issue on this action's GitHub repo.",
	);
	expect(mockSetOutput).toHaveBeenCalledTimes(0);
});

it("setsFailed if the a file has an unexpected status", async () => {
	const opts = {
		format: "space-delimited" as any,
	};

	mockCompareCommitsWithBaseHead.mockResolvedValue({
		status: 200,
		data: {
			status: "ahead",
			files: [
				{
					filename: "file.txt",
					status: "modified",
				},
				{
					filename: "dir/file2.txt",
					status: "surprise",
				},
				{
					filename: "dir3/file with space.js",
					status: "added",
				},
			],
		},
	});

	await run(
		{
			...baseContext,
			eventName: "push",
			payload: {
				before: "something",
				after: "something2",
			}, // required since we serialize this for debug
		} as any,
		mockOctoKit as any,
		opts,
	);

	expect(mockSetFailed).toHaveBeenCalledWith(
		`One of your files includes an unsupported file status 'surprise' for 'dir/file2.txt', expected 'added', 'modified', 'removed', or 'renamed'.`,
	);
	expect(mockSetOutput).toHaveBeenCalledTimes(0);
});

const formatVarianets = [
	["csv", (files: string[]) => files.join(",")],
	["space-delimited", (files: string[]) => files.join(" ")],
	["json", (files: string[]) => JSON.stringify(files)],
] as [string, (files: string[]) => string][];

it.each(
	formatVarianets.reduce(
		(eachEntry, formatVar) => {
			const [format, expTransform] = formatVar;
			eachEntry.push([
				format,
				"pull_request",
				false,
				`${mockPullRequestPayload.pull_request.base.ref}...${mockPullRequestPayload.pull_request.head.ref}`,
				mockPullRequestPayload,
				expTransform,
			]);
			eachEntry.push([
				format,
				"pull_request",
				true,
				`${baseContext.repo.owner}:${mockPullRequestPayload.pull_request.base.ref}...differentUser:${mockPullRequestPayload.pull_request.head.ref}`,
				{
					...mockPullRequestPayload,
					pull_request: {
						...mockPullRequestPayload.pull_request,
						head: {
							...mockPullRequestPayload.pull_request.head,
							repo: {
								...mockPullRequestPayload.pull_request.head.repo,
								owner: {
									...mockPullRequestPayload.pull_request.head.repo.owner,
									login: "differentUser",
								},
							},
						},
					},
				},
				expTransform,
			]);
			eachEntry.push([
				format,
				"push",
				false,
				`${mockPushPayload.before}...${mockPushPayload.after}`,
				mockPushPayload,
				expTransform,
			]);
			return eachEntry;
		},
		[] as [
			string,
			string,
			boolean,
			string,
			{ [prop: string]: any },
			(files: string[]) => string,
		][],
	),
)(
	"delivers the results for format %s and event %s (forked: %s)",
	async (format, eventName, _forked, expBasename, payload, expTransform) => {
		const opts = {
			format: format as any,
		};
		// There's an error test for space-delimited
		const spacedelimitedFiles =
			format !== "space-delimited"
				? [
						{
							filename: "dir3/file with space.js",
							status: "added",
						},
					]
				: [];
		const files = [
			{
				filename: "file.txt",
				status: "modified",
			},
			{
				filename: "dir/file2.txt",
				status: "renamed",
			},
			{
				filename: "addedFile",
				status: "added",
			},
			{
				filename: "removedFile",
				status: "removed",
			},
			...spacedelimitedFiles,
		];
		mockCompareCommitsWithBaseHead.mockResolvedValue({
			status: 200,
			data: {
				status: "ahead",
				files,
			},
		});

		await run(
			{
				...baseContext,
				eventName,
				payload, // required since we serialize this for debug
			} as any,
			mockOctoKit as any,
			opts,
		);

		expect(mockCompareCommitsWithBaseHead).toHaveBeenCalledWith({
			owner: baseContext.repo.owner,
			repo: baseContext.repo.repo,
			basehead: expBasename,
			per_page: 250,
			page: 1,
		});

		expect(mockSetFailed).toHaveBeenCalledTimes(0);

		expect(mockSetOutput).toHaveBeenCalledWith(
			"all",
			expTransform(files.map((f) => f.filename)),
		);
		expect(mockSetOutput).toHaveBeenCalledWith(
			"added",
			expTransform(
				files.filter((f) => f.status === "added").map((f) => f.filename),
			),
		);
		expect(mockSetOutput).toHaveBeenCalledWith(
			"modified",
			expTransform(
				files.filter((f) => f.status === "modified").map((f) => f.filename),
			),
		);
		expect(mockSetOutput).toHaveBeenCalledWith(
			"removed",
			expTransform(
				files.filter((f) => f.status === "removed").map((f) => f.filename),
			),
		);
		expect(mockSetOutput).toHaveBeenCalledWith(
			"renamed",
			expTransform(
				files.filter((f) => f.status === "renamed").map((f) => f.filename),
			),
		);
		expect(mockSetOutput).toHaveBeenCalledWith(
			"added_modified",
			expTransform(
				files
					.filter((f) => f.status === "added" || f.status === "modified")
					.map((f) => f.filename),
			),
		);
		expect(mockSetOutput).toHaveBeenCalledWith(
			"deleted",
			expTransform(
				files.filter((f) => f.status === "removed").map((f) => f.filename),
			),
		);
	},
);

it("filters the results to match the globs", async () => {
	const opts = {
		format: "space-delimited" as Format,
		filter: "dir/**, **/*.inc",
	};
	const files = [
		{
			filename: "file.txt",
			status: "modified",
		},
		{
			filename: "dir/file2.txt",
			status: "renamed",
		},
		{
			filename: "addedFile",
			status: "added",
		},
		{
			filename: "removedFile.inc",
			status: "removed",
		},
	];
	mockCompareCommitsWithBaseHead.mockResolvedValue({
		status: 200,
		data: {
			status: "ahead",
			files,
		},
	});

	await run(
		{
			...baseContext,
			eventName: "push",
			payload: mockPushPayload, // required since we serialize this for debug
		} as any,
		mockOctoKit as any,
		opts,
	);

	expect(mockCompareCommitsWithBaseHead).toHaveBeenCalledWith({
		owner: baseContext.repo.owner,
		repo: baseContext.repo.repo,
		basehead: `${mockPushPayload.before}...${mockPushPayload.after}`,
		per_page: 250,
		page: 1,
	});

	expect(mockSetFailed).toHaveBeenCalledTimes(0);

	expect(mockSetOutput).toHaveBeenCalledWith(
		"all",
		"dir/file2.txt removedFile.inc",
	);
	expect(mockSetOutput).toHaveBeenCalledWith("added", "");
	expect(mockSetOutput).toHaveBeenCalledWith("modified", "");
	expect(mockSetOutput).toHaveBeenCalledWith("removed", "removedFile.inc");
	expect(mockSetOutput).toHaveBeenCalledWith("renamed", "dir/file2.txt");
	expect(mockSetOutput).toHaveBeenCalledWith("added_modified", "");
	expect(mockSetOutput).toHaveBeenCalledWith("deleted", "removedFile.inc");
});
