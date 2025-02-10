import { setFailed, setOutput, getInput } from "@actions/core";
import { run } from "./run";

jest.mock("@actions/core");

const mockSetFailed = jest.mocked(setFailed);
const mockSetOutput = jest.mocked(setOutput);
const mockGetInput = jest.mocked(getInput);
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
		},
		head: {
			sha: "headSha",
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
	mockGetInput.mockImplementation((token) => {
		if (token === "token") {
			return "someToken";
		}
		if (token === "format") {
			return "unsupported format";
		}
		throw new Error("Unexpected getInput token " + token);
	});

	await run({} as any, mockOctoKit as any);

	expect(mockSetFailed).toHaveBeenCalledWith(
		`Format must be one of 'string-delimited', 'csv', or 'json', got 'unsupported format'.`,
	);
	expect(mockSetOutput).toHaveBeenCalledTimes(0);
});

it("setsFailed if the event is not accounted for", async () => {
	mockGetInput.mockImplementation((token) => {
		if (token === "token") {
			return "someToken";
		}
		if (token === "format") {
			return "json";
		}
		throw new Error("Unexpected getInput token " + token);
	});

	await run(
		{
			...baseContext,
			eventName: "something",
			payload: {}, // required since we serialize this for debug
		} as any,
		mockOctoKit as any,
	);

	expect(mockSetFailed).toHaveBeenCalledWith(
		`This action only supports pull requests and pushes, something events are not supported. Please submit an issue on this action's GitHub repo if you believe this in correct.`,
	);
	expect(mockSetOutput).toHaveBeenCalledTimes(0);
});

it("setsFailed if it can't determine head and base sha's", async () => {
	mockGetInput.mockImplementation((token) => {
		if (token === "token") {
			return "someToken";
		}
		if (token === "format") {
			return "json";
		}
		throw new Error("Unexpected getInput token " + token);
	});

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
	);

	expect(mockSetFailed).toHaveBeenCalledWith(
		`The base and head commits are missing from the payload for this push event. ` +
			"Please submit an issue on this action's GitHub repo.",
	);
	expect(mockSetOutput).toHaveBeenCalledTimes(0);
});

it("setsFailed if the response if not 200", async () => {
	mockGetInput.mockImplementation((token) => {
		if (token === "token") {
			return "someToken";
		}
		if (token === "format") {
			return "json";
		}
		throw new Error("Unexpected getInput token " + token);
	});

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
	);

	expect(mockSetFailed).toHaveBeenCalledWith(
		`The GitHub API for comparing the base and head commits for this push event returned 401, expected 200. Please submit an issue on this action's GitHub repo.`,
	);
	expect(mockSetOutput).toHaveBeenCalledTimes(0);
});

it.each([["diverged"], ["behind"], ["identical"]])(
	"setsFailed if the response if the head is not ahead of the base (%s)",
	async (status) => {
		mockGetInput.mockImplementation((token) => {
			if (token === "token") {
				return "someToken";
			}
			if (token === "format") {
				return "json";
			}
			throw new Error("Unexpected getInput token " + token);
		});

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
		);

		expect(mockSetFailed).toHaveBeenCalledWith(
			`The head commit for this push event is not ahead of the base commit. ` +
				"Please ensure your changes are on top of the base branch so that comparison is accurate.",
		);
		expect(mockSetOutput).toHaveBeenCalledTimes(0);
	},
);

it("setsFailed if the a file has a space in its name and is space-delimited output", async () => {
	mockGetInput.mockImplementation((token) => {
		if (token === "token") {
			return "someToken";
		}
		if (token === "format") {
			return "space-delimited";
		}
		throw new Error("Unexpected getInput token " + token);
	});

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
	);

	expect(mockSetFailed).toHaveBeenCalledWith(
		`One of your files includes a space (dir3/file with space.js). Consider using a different output format or removing spaces from your filenames. ` +
			"Please submit an issue on this action's GitHub repo.",
	);
	expect(mockSetOutput).toHaveBeenCalledTimes(0);
});

it("setsFailed if the a file has an unexpected status", async () => {
	mockGetInput.mockImplementation((token) => {
		if (token === "token") {
			return "someToken";
		}
		if (token === "format") {
			return "space-delimited";
		}
		throw new Error("Unexpected getInput token " + token);
	});

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
	);

	expect(mockSetFailed).toHaveBeenCalledWith(
		`One of your files includes an unsupported file status 'surprise' for 'dir/file2.txt', expected 'added', 'modified', 'removed', or 'renamed'.`,
	);
	expect(mockSetOutput).toHaveBeenCalledTimes(0);
});

it.each([
	["csv", (files: string[]) => files.join(",")],
	["space-delimited", (files: string[]) => files.join(" ")],
	["json", (files: string[]) => JSON.stringify(files)],
])("delivers the results for format %s", async (format, expTransform) => {
	mockGetInput.mockImplementation((token) => {
		if (token === "token") {
			return "someToken";
		}
		if (token === "format") {
			return format;
		}
		throw new Error("Unexpected getInput token " + token);
	});
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
			eventName: "push",
			payload: {
				before: "something",
				after: "something2",
			}, // required since we serialize this for debug
		} as any,
		mockOctoKit as any,
	);

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
});
