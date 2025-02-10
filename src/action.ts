import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { run } from "./run";

void run(context, getOctokit(core.getInput("token", { required: true })));
