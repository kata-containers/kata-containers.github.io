import React, { useEffect, useState, useRef } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import Head from "next/head";
import { weatherTemplate, getWeatherIndex } from "../components/weatherTemplate";
import { OverlayPanel } from 'primereact/overlaypanel';
import MaintainerMapping from "../maintainers.yml";
import { basePath } from "../next.config.js";


export default function Home() {
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [rowsSingle, setRowsSingle] = useState([]);
  const [rowsPR, setRowsPR] = useState([]);
  const [rowsNightly, setRowsNightly] = useState([]);
  const [expandedRows, setExpandedRows] = useState([]);
  const [requiredFilter, setRequiredFilter] = useState(false);
  const [display, setDisplay] = useState("nightly");
  const [selectedPR, setSelectedPR] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      let nightlyData = {};
      let prData = {};

      if (process.env.NODE_ENV === "development") {
        nightlyData = (await import("../localData/job_stats.json")).default;
        prData = (await import("../localData/check_stats.json")).default;
      } else {
        nightlyData = await fetch(
          "https://raw.githubusercontent.com/kata-containers/kata-containers.github.io" +
            "/refs/heads/latest-dashboard-data/data/job_stats.json"
        ).then((res) => res.json());
        prData = await fetch(
          "https://raw.githubusercontent.com/kata-containers/kata-containers.github.io" +
            "/refs/heads/latest-dashboard-data/data/check_stats.json"
        ).then((res) => res.json());
      }

      try {
        const mapData = (data) => Object.keys(data).map((key) => 
          ({ name: key, ...data[key] })
        );
        setJobs(mapData(nightlyData));
        setChecks(mapData(prData));
      } catch (error) {
        // TODO: Add pop-up/toast message for error
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Set the display based on the URL.
  useEffect(() => {
    const initialDisplay = new URLSearchParams(window.location.search).get("display");
    if (initialDisplay) {
      if(initialDisplay === "prsingle"){
        const initialPR = new URLSearchParams(window.location.search).get("pr");
        if(initialPR){
          setSelectedPR(initialPR);
        }
      }
      setDisplay(initialDisplay);
    }
  }, []);

  // Filter based on required tag.
  const filterRequired = (filteredJobs) => {
    if (requiredFilter){
      filteredJobs = filteredJobs.filter((job) => job.required);
    }
    return filteredJobs;
  };

  // Filter and set the rows for Nightly view.
  useEffect(() => {
    setLoading(true);
    let filteredJobs = filterRequired(jobs);
    //Set the rows for the table.
    setRowsNightly(
      filteredJobs.map((job) => ({
        name          : job.name,
        runs          : job.runs,
        fails         : job.fails,
        skips         : job.skips,
        required      : job.required,
        weather       : getWeatherIndex(job),
        reruns        : job.reruns,
        total_reruns  : job.reruns.reduce((total, r) => total + r, 0),
      }))
    );
    setLoading(false);
  }, [jobs, requiredFilter]);

  // Filter and set the rows for PR Checks view.
  useEffect(() => {
    setLoading(true);
    let filteredChecks = filterRequired(checks)

    //Set the rows for the table.
    setRowsPR(
      filteredChecks.map((check) => ({
        name          : check.name,
        runs          : check.runs,
        fails         : check.fails,
        skips         : check.skips,
        required      : check.required,
        weather       : getWeatherIndex(check),
        reruns        : check.reruns,
        total_reruns  : check.reruns.reduce((total, r) => total + r, 0),
      }))
    );
    setLoading(false);
  }, [checks, requiredFilter]);

  // Filter and set the rows for Single PR view. 
  useEffect(() => {
    setLoading(true);

    let filteredData = filterRequired(checks);

    filteredData = filteredData.map((check) => {
      // Only if the check include the run number, add it to the data. 
      const index = check.run_nums.indexOf(Number(selectedPR));
      return index !== -1
        ? {
            name: check.name,
            required: check.required,
            result: check.results[index],
            runs: check.reruns[index] + 1,
          }
        : null;
    }).filter(Boolean); 

    setRowsSingle(filteredData);
    setLoading(false);
  }, [checks, selectedPR, requiredFilter]);

  // Close all rows on view switch. 
  // Needed because if view is switched, breaks expanded row toggling.
  useEffect(() => {
    setExpandedRows([])
  }, [display]); 

  // Update the URL on display change
  const updateUrl = (view, pr) => {
    const path = new URLSearchParams();
    path.append("display", view);
    // Add PR number Single PR view and a PR is provided
    if (view === "prsingle" && pr) {
      path.append("pr", pr);
    }
    // Update the URL without reloading
    window.history.pushState({}, '', `${basePath}/?${path.toString()}`);
  };

  const toggleRow = (rowData) => {
    const isRowExpanded = expandedRows.includes(rowData);

    let updatedExpandedRows;
    if (isRowExpanded) {
      updatedExpandedRows = expandedRows.filter((r) => r !== rowData);
    } else {
      updatedExpandedRows = [...expandedRows, rowData];
    }

    setExpandedRows(updatedExpandedRows);
  };

  const buttonClass = (active) => `tab md:px-4 px-2 py-2 border-2 
    ${active ? "border-blue-500 bg-blue-500 text-white" 
      : "border-gray-300 bg-white hover:bg-gray-100"}`;

  const tabClass = (active) => `tab md:px-4 px-2 py-2 border-b-2 focus:outline-none
    ${active ? "border-blue-500 bg-gray-300" 
      : "border-gray-300 bg-white hover:bg-gray-100"}`;


  // Template for rendering the Name column as a clickable item
  const nameTemplate = (rowData) => {
    return (
      <span onClick={() => toggleRow(rowData)} style={{ cursor: "pointer" }}>
        {rowData.name}
      </span>
    );
  };

  const maintainRefs = useRef([]);
  const rerunRefs = useRef([]);

  const rowExpansionTemplate = (data) => {
    const job = (display === "nightly" 
      ? jobs
      : checks).find((job) => job.name === data.name);
  
    if (!job) return (
      <div className="p-3 bg-gray-100">
        No data available for this job.
      </div>
    ); 

    // Prepare run data
    const getRunStatusIcon = (runs) => {
      if (Array.isArray(runs)) {
        const allPass = runs.every(run => run === "Pass");
        const allFail = runs.every(run => run === "Fail");

        if (allPass) {return "✅";}
        if (allFail) {return "❌";}
      } else if (runs === "Pass") {
        return "✅";
      } else if (runs === "Fail") {
        return "❌";
      }
      return "⚠️";  // return a warning if a mix of results
    };

    const runEntries = job.run_nums.map((run_num, idx) => ({
      run_num,
      result: job.results[idx],
      reruns: job.reruns[idx],
      rerun_result: job.rerun_results[idx],
      url: job.urls[idx],
      attempt_urls: job.attempt_urls[idx],
    })); 

    // Find maintainers for the given job
    const maintainerData = MaintainerMapping.mappings
      .filter(({ regex }) => new RegExp(regex).test(job.name))
      .flatMap((match) =>
        match.owners.map((owner) => ({
          ...owner,
          group: match.group, 
        }))
      );

    // Group maintainers by their group name
    const groupedMaintainers = maintainerData.reduce((acc, owner) => {
      if (!acc[owner.group]) {
        acc[owner.group] = [];
      }
      acc[owner.group].push(owner);
      return acc;
    }, {});


    return (
      <div key={`${job.name}-runs`} className="p-3 bg-gray-100">
        {/* Display last 10 runs */}
        <div className="flex flex-wrap gap-4">
          {runEntries.map(({
            run_num, 
            result, 
            url, 
            reruns, 
            rerun_result, 
            attempt_urls 
          }, idx) => {
            const allResults = rerun_result 
              ?  [result, ...rerun_result] 
              : [result];

            const runStatuses = allResults.map((result, idx) => 
              `${allResults.length - idx}. ${result === 'Pass' 
                ? '✅ Success' 
                : result === 'Fail' 
                  ? '❌ Fail' 
                  : '⚠️ Warning'}`);

            // IDs can't have a '/'...
            const sanitizedJobName = job.name.replace(/[^a-zA-Z0-9-_]/g, '');

            const badgeReruns = `reruns-${sanitizedJobName}-${run_num}`;

            rerunRefs.current[badgeReruns] = rerunRefs.current[badgeReruns] 
              || React.createRef();

            return (
              <div key={run_num} className="flex">
                <div key={idx} className="flex items-center">
                  {/* <a href={url} target="_blank" rel="noopener noreferrer"> */}
                  <a href={attempt_urls[0]} target="_blank" rel="noopener noreferrer">
                    {getRunStatusIcon(allResults)} {run_num}
                  </a>
                </div>
                {reruns > 0 &&(
                  <span className="p-overlay-badge">
                    <sup  className="text-xs font-bold align-super ml-1"
                          onMouseEnter={(e) => 
                            rerunRefs.current[badgeReruns].current.toggle(e)}>
                      {reruns+1}
                    </sup>
                    <OverlayPanel ref={rerunRefs.current[badgeReruns]} dismissable
                    onMouseLeave={(e) => 
                      rerunRefs.current[badgeReruns].current.toggle(e)}>
                    <ul className="bg-white border rounded shadow-lg p-2">
                      {runStatuses.map((status, index) => (
                        <li key={index} className="p-2 hover:bg-gray-200">
                          <a 
                            href={attempt_urls[index] || `${url}/attempts/${index}`} 
                            target="_blank" 
                            rel="noopener noreferrer">
                              {status}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </OverlayPanel>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {/* Display Maintainers, if there's any */}
        <div className="mt-4 p-2 bg-gray-300 w-full">
          {Object.keys(groupedMaintainers).length > 0 ? (
            <div className="grid grid-cols-2 p-2 gap-6">
              {Object.entries(groupedMaintainers).map(
                ([group, owners], groupIndex) => (
                  <div key={groupIndex} className="flex flex-col max-w-xs">
                    {/* List the group name */}
                    <strong className="pl-2">{group}:</strong>
                    <div>
                      {/* List all maintainers for the group */}
                      {owners.map((owner, ownerIndex) => {
                        const badgeMaintain = `maintain-${owner.github}`;
                        maintainRefs.current[badgeMaintain] =
                          maintainRefs.current[badgeMaintain] || React.createRef();

                        return (
                          // Create the OverlayPanel with contact information.
                          <span key={ownerIndex}>
                            <span
                              onMouseEnter={(e) =>
                                maintainRefs.current[badgeMaintain].current.toggle(e)
                              }
                            >
                              <a
                                href={`https://github.com/${owner.github}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 underline pl-2 whitespace-nowrap"
                              >
                                {owner.fullname}
                              </a>
                              {ownerIndex < owners.length - 1 && ", "}
                            </span>
                            <OverlayPanel
                              ref={maintainRefs.current[badgeMaintain]}
                              dismissable
                              onMouseLeave={(e) =>
                                maintainRefs.current[badgeMaintain].current.toggle(e)
                              }
                            >
                              <ul className="bg-white border rounded shadow-lg p-2">
                                <li className="p-2 hover:bg-gray-200">
                                  <span className="font-bold mr-4">Email:</span>{" "}
                                  {owner.email}
                                </li>
                                <a
                                  href={`https://github.com/${owner.github}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <li className="p-2 hover:bg-gray-200 flex justify-between">
                                    <span className="font-bold mr-4">
                                      GitHub:
                                    </span>
                                    <span className="text-right">
                                      {owner.github}
                                    </span>
                                  </li>
                                </a>
                                <a
                                  href={`${owner.slackurl}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <li className="p-2 hover:bg-gray-200 flex justify-between">
                                    <span className="font-bold mr-4">Slack:</span>
                                    <span className="text-right">
                                      @{owner.slack}
                                    </span>
                                  </li>
                                </a>
                              </ul>
                            </OverlayPanel>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <div>No Maintainer Information Available</div>
          )}
        </div>
      </div>
    );
  };

  // Render table for nightly view.
  const renderNightlyTable = () => (
    <DataTable
      value={rowsNightly}
      expandedRows={expandedRows}
      stripedRows
      rowExpansionTemplate={rowExpansionTemplate}
      onRowToggle={(e) => setExpandedRows(e.data)}
      loading={loading}
      emptyMessage="No results found."
      sortField="fails"    
      sortOrder={-1}       
    >
      <Column expander/>
      <Column
        field="name"
        header="Name"
        body={nameTemplate}
        className="select-text"
        sortable
      />
      <Column field = "required"      header = "Required" sortable/>
      <Column 
        field = "runs"
        header = "Runs"
        className="whitespace-nowrap px-2"
        sortable />
      <Column field = "total_reruns" header = "Reruns" sortable/>
      <Column field = "fails"         header = "Fails"   sortable/>
      <Column field = "skips"         header = "Skips"   sortable/>
      <Column 
        field = "weather"
        header = "Weather"
        body = {weatherTemplate} 
        sortable />
    </DataTable>
  );

  const renderPRTable = () => (
    <DataTable
      value={rowsPR}
      expandedRows={expandedRows}
      stripedRows
      rowExpansionTemplate={rowExpansionTemplate}
      onRowToggle={(e) => setExpandedRows(e.data)}
      loading={loading}
      emptyMessage="No results found."
      sortField="fails"
      sortOrder={-1}
    >
      <Column expander/>
      <Column
        field="name"
        header="Name"
        body={nameTemplate}
        className="select-text"
        sortable
      />
      <Column field = "required"      header = "Required" sortable/>
      <Column 
        field = "runs"   
        header = "Runs"
        className="whitespace-nowrap px-2"
        sortable />
      <Column field = "total_reruns" header = "Reruns" sortable/>
      <Column field = "fails"         header = "Fails"   sortable/>
      <Column field = "skips"         header = "Skips"   sortable/>
      <Column 
        field = "weather"  
        header = "Weather"  
        body = {weatherTemplate} 
        sortable />
    </DataTable>
  );

  // Make a list of all unique run numbers in the check data.
  const runNumOptions = [...new Set(checks.flatMap(check => check.run_nums))].sort((a, b) => b - a);

  // Render table for prsingle view 
  const renderSingleViewTable = () => (
    <DataTable
      value={rowsSingle}
      expandedRows={expandedRows}
      stripedRows
      rowExpansionTemplate={rowExpansionTemplate}
      onRowToggle={(e) => setExpandedRows(e.data)}
      loading={loading}
      emptyMessage={selectedPR.length == 0 ? "Select a Pull Request above." : "No results found."}
    >
      <Column expander />
      <Column
        field="name"
        header="Name"
        body={nameTemplate} 
        className="select-all"
        sortable
      />
      <Column
        field="required"
        header="Required"
        sortable
      />
      <Column
        field="result"
        header="Result"
        sortable
      />
      <Column
        field="runs"
        header="Total Runs"
        sortable
      />
    </DataTable>
  );

  return (
    <div className="text-center">
      <Head>
        <title>Kata CI Dashboard</title>
      </Head>

      <h1
        className={
          "text-4xl mt-4 mb-0 underline text-inherit hover:text-blue-500"
        }
      >
        <a
            href={display === 'nightly' 
              ? "https://github.com/kata-containers/kata-containers/" +
                "actions/workflows/ci-nightly.yaml"
              : "https://github.com/kata-containers/kata-containers/" +
                "/pulls?state=closed"}
            target="_blank"
            rel="noopener noreferrer"
          >
            Kata CI Dashboard
          </a>
      </h1>
      <div className="flex flex-wrap mt-2 p-4 md:text-base text-xs">
        <div className="space-x-2 pb-2 pr-3 mx-auto flex">
        <button 
              className={tabClass(display === "nightly")}
              onClick={() => {
                setDisplay("nightly");
                updateUrl("nightly");

              }}>
              Nightly Jobs
            </button>
            <button 
              className={tabClass(display === "prchecks")}
              onClick={() => {
                setDisplay("prchecks");
                updateUrl("prchecks");
              }}>
              PR Checks
            </button>
            <button 
              className={tabClass(display === "prsingle")}
              onClick={() => {
                setDisplay("prsingle");
                updateUrl("prsingle", selectedPR);
              }}>
              Single PR
            </button>
            {display === "prsingle" && ( 
              <div className="bg-blue-500 p-2 rounded-xl h-fit">
                <select 
                  id="selectedrun"
                  className="px-1 h-fit rounded-lg"
                  onChange={(e) => {
                      setSelectedPR(e.target.value);
                      updateUrl("prsingle", e.target.value);
                    }}
                  value={selectedPR} >
                    <option value="">Select PR</option>
                    {runNumOptions.map(num => (
                      <option key={num} value={num}>#{num}</option>
                    ))}
                </select>
              </div>
            )}
        </div>
      </div>

      
      <div className={"m-0 h-full px-4 overflow-x-hidden overflow-y-auto \
                        bg-surface-ground antialiased select-text"}>
        <button 
          className={buttonClass(requiredFilter)} 
          onClick={() => setRequiredFilter(!requiredFilter)}>
          Required Jobs Only
        </button>
        <div className="mt-4 text-center md:text-lg text-base">
        Total Rows: {display === "prsingle" ? rowsSingle.length : display === "prchecks" ? rowsPR.length : rowsNightly.length}
        </div>
        <div>{display === "prsingle" ? renderSingleViewTable() : display === "prchecks" ? renderPRTable() : renderNightlyTable()}</div>
      </div>
    </div>
  );
}
