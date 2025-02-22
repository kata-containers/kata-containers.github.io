//
// This script is designed to query the github API for a useful summary
// of recent nightly CI results (though this could be expanded later).
//
// The general flow is as follows:
//   - It queries the github API for the workflow runs for the nightly CI (e.g.
//     the last 10 nights/runs).
//   - For each of those runs, it queries the API for all the jobs data (e.g.
//     data on the tdx or snp jobs in each run).
//   - It reorganizes and summarizes those results in an array, where each
//     entry is information about a job and how it has performed over the last
//     few runs (e.g. pass or fail).
// 
// To run locally:
// node --require dotenv/config scripts/fetch-ci-nightly-data.js 
//
// .env file with:
// NODE_ENV=development
// TOKEN=token <GITHUB_PAT_OR_OTHER_VALID_TOKEN>

// Set token used for making Authorized GitHub API calls.
// In dev, set by .env file; in prod, set by GitHub Secret.
if(process.env.NODE_ENV === "development"){
  require('dotenv').config();
}
const TOKEN = process.env.TOKEN;  
  
// Github API URL for the kata-container ci-nightly workflow's runs. This
// will only get the most recent 10 runs ('per_page=10').
const total_runs = 10;

const ci_nightly_runs_url =
  "https://api.github.com/repos/" +
  "kata-containers/kata-containers/actions/workflows/" +
  `ci-nightly.yaml/runs?per_page=${total_runs}`;
  // NOTE: For checks run on main after push/merge,
  // do similar call with: payload-after-push.yaml.

// Github API URL for the main branch of the kata-containers repo.
// Used to get the list of required jobs.
const main_branch_url = "https://api.github.com/repos/" +
                        "kata-containers/kata-containers/branches/main";

// The number of jobs to fetch from the github API on each paged request.
const jobs_per_request = 100;

// Count of the number of fetches.
let fetch_count = 0;

// Perform a fetch request (to Github's API).
async function fetch_url(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `token ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch from ${url}: ${response.status}: ` +
                                                   `${response.statusText}`);
  }

  const json = await response.json();
  fetch_count++;
  return await json;
}

// Extract list of required jobs. 
// (i.e. main branch details: protection: required_status_checks: contexts)
function get_required_jobs(main_branch) {
  return main_branch["protection"]["required_status_checks"]["contexts"];
}

// Get job data about a workflow run.
// Returns a map that has information about a run, e.g.
//   ID assigned by github
//   run number assigned by github
//   'jobs' array, which has some details about each job from that run.
function get_job_data(run) {
  // Perform the actual (paged) request
  async function fetch_jobs_by_page(which_page) {
    const jobs_url = `${run["jobs_url"]}?per_page=${jobs_per_request}` +
                     `&page=${which_page}`;
    const response = await fetch(jobs_url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `token ${TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch jobs: ${response.status}: ` +
                                            `${response.statusText}`);
    }
    const json = await response.json();
    fetch_count++;
    return await json;
  }

  // Fetch the jobs for a run. Extract a few details from the response,
  // including the job name and whether it concluded successfully.
  function fetch_jobs(p) {
    return fetch_jobs_by_page(p).then(function (jobs_request) {
      for (const job of jobs_request["jobs"]) {
        run_with_job_data["jobs"].push({
          name: job["name"],
          run_id: job["run_id"],
          html_url: job["html_url"],
          conclusion: job["conclusion"],
        });
      }
      if (p * jobs_per_request >= jobs_request["total_count"]) {
        return run_with_job_data;
      }
      return fetch_jobs(p + 1);
    });
  }

  const run_with_job_data = {
    id: run["id"],
    run_number: run["run_number"],
    created_at: run["created_at"],
    conclusion: null,
    jobs: [],
  };
  if (run["status"] === "in_progress") {
    return new Promise((resolve) => {
      resolve(run_with_job_data);
    });
  }
  run_with_job_data["conclusion"] = run["conclusion"];
  return fetch_jobs(1);
}
// Calculate and return job stats across all runs
function compute_job_stats(runs_with_job_data, required_jobs) {
  const job_stats = {};
  for (const run of runs_with_job_data) {
    for (const job of run["jobs"]) {
      if (!(job["name"] in job_stats)) {
        job_stats[job["name"]] = {
          runs: 0, // e.g. 10, if it ran 10 times
          fails: 0, // e.g. 3, if it failed 3 out of 10 times
          skips: 0, // e.g. 7, if it got skipped the other 7 times
          urls: [], // ordered list of URLs associated w/ each run
          results: [], // an array of strings, e.g. 'Pass', 'Fail', ...
          run_nums: [], // ordered list of github-assigned run numbers
        };
      }
      const job_stat = job_stats[job["name"]];
      job_stat["runs"] += 1;
      job_stat["run_nums"].push(run["run_number"]);
      job_stat["urls"].push(job["html_url"]);
      if (job["conclusion"] !== "success") {
        if (job["conclusion"] === "skipped") {
          job_stat["skips"] += 1;
          job_stat["results"].push("Skip");
        } else {
          // failed or cancelled
          job_stat["fails"] += 1;
          job_stat["results"].push("Fail");
        }
      } else {
        job_stat["results"].push("Pass");
      }
      job_stat["required"] = required_jobs.includes(job["name"]);
    }
  }
  return job_stats;
}


async function main() {
  // Fetch recent workflow runs via the github API
  const workflow_runs = await fetch_url(ci_nightly_runs_url);

  // Fetch required jobs from main branch
  const main_branch = await fetch_url(main_branch_url);
  const required_jobs = get_required_jobs(main_branch);

  // Fetch job data for each of the runs.
  // Store all of this in an array of maps, runs_with_job_data.
  const promises_buf = [];
  for (const run of workflow_runs["workflow_runs"]) {
    promises_buf.push(get_job_data(run));
  }
  let runs_with_job_data = await Promise.all(promises_buf);
  
  // Transform the raw details of each run and its jobs' results into a
  // an array of just the jobs and their overall results (e.g. pass or fail,
  // and the URLs associated with them).
  const job_stats = compute_job_stats(runs_with_job_data, required_jobs);

  // Write the job_stats to console as a JSON object
  console.log(JSON.stringify(job_stats));
}


main();
