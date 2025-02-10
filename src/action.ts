import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { Format, run } from "./run";

void run(context, getOctokit(core.getInput("token", { required: true })), {
	format: core.getInput("format", { required: true }) as Format,
	filter: core.getInput("filter"),
});
