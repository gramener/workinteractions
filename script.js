/* global bootstrap */

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { network } from "https://cdn.jsdelivr.net/npm/@gramex/network@2.1.0";
import { num2, pc } from "https://cdn.jsdelivr.net/npm/@gramex/ui/dist/format.js";

// nodes is an array of objects with keys: id, job_category, job_title, location, role, subunit
// links is an array of objects with keys: weight: (hours), source: (id), target: (id)
const { nodes, links: rawLinks } = await fetch("interactions.json").then((res) => res.json());
const nodesById = Object.fromEntries(nodes.map((d) => [d.id, d]));
const links = rawLinks.map(({ calendar, email, chat, video, source, target }) => ({
  calendar,
  email,
  chat,
  video,
  source: nodesById[source],
  target: nodesById[target],
}));

let key, groupNodes, groupLinks, center, groupRadius, groupStrokeWidthScale;
let personNetwork, groupNetwork;
const color = d3.scaleOrdinal(d3.schemeCategory10);

function reKey() {
  key = document.querySelector("#key").value;
  groupNodes = d3
    .rollups(
      nodes,
      (D) => ({
        calendar: d3.sum(D, (d) => d.calendar),
        email: d3.sum(D, (d) => d.email),
        chat: d3.sum(D, (d) => d.chat),
        video: d3.sum(D, (d) => d.video),
        n: D.length,
      }),
      (d) => d[key],
    )
    .map(([id, values]) => ({ id, ...values }));
  const rawGroupLinks = d3
    .flatRollup(
      links,
      (D) => ({
        calendar: d3.sum(D, (d) => d.calendar),
        email: d3.sum(D, (d) => d.email),
        chat: d3.sum(D, (d) => d.chat),
        video: d3.sum(D, (d) => d.video),
        n: D.length,
      }),
      (d) => d.source[key],
      (d) => d.target[key],
    )
    .map(([source, target, values]) => ({ source, target, ...values }));
  const groupNodesById = Object.fromEntries(groupNodes.map((d) => [d.id, d]));
  groupLinks = rawGroupLinks.map(({ source, target, ...rest }) => ({
    source: groupNodesById[source],
    target: groupNodesById[target],
    ...rest,
  }));
  // Distribute the key uniformly around a circle
  center = Object.fromEntries(
    groupNodes.map(({ id }, i) => {
      const angle = (i / groupNodes.length) * 2 * Math.PI;
      return [id, { x: Math.cos(angle), y: Math.sin(angle) }];
    }),
  );

  reScale();
}

function reScale() {
  const radiusWeight = document.querySelector("#radius-weight").value;
  const calendarWeight = document.querySelector("#calendar-weight").value;
  const emailWeight = document.querySelector("#email-weight").value;
  const chatWeight = document.querySelector("#chat-weight").value;
  const videoWeight = document.querySelector("#video-weight").value;
  links.forEach(
    (d) =>
      (d.weight = calendarWeight * d.calendar + emailWeight * d.email + chatWeight * d.chat + videoWeight * d.video),
  );
  groupLinks.forEach(
    (d) =>
      (d.weight = calendarWeight * d.calendar + emailWeight * d.email + chatWeight * d.chat + videoWeight * d.video),
  );
  groupRadius = d3
    .scaleSqrt()
    .domain(d3.extent(groupNodes, (d) => d.n))
    .range([10 * radiusWeight, 80 * radiusWeight]);
  groupStrokeWidthScale = d3
    .scalePow()
    .exponent(0.5)
    .domain(d3.extent(groupLinks, (d) => d.weight / d.n))
    .range([1, 20]);

  redraw();
}

function redraw() {
  const minTime = document.querySelector("#min-time").value;
  document.querySelector("#min-time-value").textContent = Math.round(minTime * 60);
  document.querySelector("#min-time").max = d3.max(links, (d) => d.weight / 5);

  groupNodes.forEach((d) => (d.linkCount = 0));
  const groupLinksFiltered = groupLinks.filter(({ weight, n }) => weight / n >= minTime);
  groupLinksFiltered.forEach((d) => {
    if (d.source.id != d.target.id) {
      d.source.linkCount++;
      d.target.linkCount++;
    }
  });

  groupNetwork = network("#group-network", {
    nodes: groupNodes,
    links: groupLinksFiltered,
    forces: {
      x: ({ width }) =>
        d3.forceX((d) => {
          return d.linkCount ? (width * 3) / 4 : width / 4;
        }),
      collide: () => d3.forceCollide().radius((d) => groupRadius(d.n) + 5),
    },
    d3,
  });

  groupNetwork.nodes
    .attr("fill", (d) => color(d.id))
    .attr("r", (d) => groupRadius(d.n))
    .attr("data-bs-toggle", "tooltip")
    .attr("title", (d) => `${d.id} (${d.n} people)`);
  groupNetwork.links
    .attr("stroke", ({ weight, n }) => `rgba(var(--bs-body-color-rgb), ${(weight / n) * 0.5})`)
    .attr("stroke-width", ({ weight, n }) => groupStrokeWidthScale(weight / n));

  personNetwork = network("#person-network", {
    nodes,
    links: links.filter(({ weight }) => weight >= minTime),
    forces: {
      x: ({ width }) => d3.forceX((d) => width / 2 + center[d[key]].x * width * 0.25),
      y: ({ height }) => d3.forceY((d) => height / 2 + center[d[key]].y * height * 0.25),
    },
    d3,
  });
  personNetwork.nodes
    .attr("fill", (d) => color(d[key]))
    .attr("r", 5)
    .attr("data-bs-toggle", "tooltip")
    .attr("title", (d) => `${d.id}: ${d[key]}`);
  personNetwork.links.attr("stroke", ({ weight }) => `rgba(var(--bs-body-color-rgb), ${weight * 0.02})`);
}

function hashChange() {
  const hash = location.hash.slice(1);
  const params = new URLSearchParams(hash);
  if (params.has("key")) document.querySelector("#key").value = params.get("key");
  if (params.has("min-time")) document.querySelector("#min-time").value = params.get("min-time");
  reKey();
}

document.querySelector("#loading").remove();
for (const el of document.querySelectorAll("#key, .re-key")) el.addEventListener("input", reKey);
for (const el of document.querySelectorAll(".re-scale"))
  el.addEventListener("input", (e) => {
    if (e.target.dataset.type == "pc") document.querySelector(e.target.dataset.target).textContent = pc(e.target.value);
    if (e.target.dataset.type == "num")
      document.querySelector(e.target.dataset.target).textContent = num2(e.target.value * e.target.dataset.value);
    reScale();
  });
document.querySelector("#min-time").addEventListener("input", redraw);
document.querySelector("#pause").addEventListener("click", () => {
  personNetwork.simulation.stop();
  groupNetwork.simulation.stop();
});
window.addEventListener("hashchange", hashChange);
new bootstrap.Tooltip("body", { selector: '[data-bs-toggle="tooltip"]' });

hashChange();
