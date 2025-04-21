// Deadlock Detection Simulator JavaScript
let num_processes = 0;
let num_resources = 0;
let resources = [];
let selectedId;
let targetId;
let rag = [];  // Resource Allocation Graph
let wfg;       // Wait-For Graph
let bfg;       // Blocking Resource Graph
let visited;
let cycle;
let cycleNodes;
let existingEdges = new Set();
let tooltip;
let currentZoom = 1;

/////////////////////////////
// INITIALIZATION
/////////////////////////////

document.addEventListener('DOMContentLoaded', function() {
    initWorkspaceDroppable(".workspace-container");
    setupEventListeners();
    initTooltip();

    // Add event listeners for node and edge creation buttons
    document.getElementById("cprocess").addEventListener("click", createProcess);
    document.getElementById("cres").addEventListener("click", createResource);
    document.getElementById("creqedge").addEventListener("click", createRequestEdge);
    document.getElementById("calocedge").addEventListener("click", createAllocationEdge);
    document.getElementById("delete-edge").addEventListener("click", deleteEdge);
    document.getElementById("start").addEventListener("click", detectDeadlock);
    document.getElementById("reset").addEventListener("click", resetWorkspace);
    
    // Zoom controls
    document.getElementById("zoom-in").addEventListener("click", zoomIn);
    document.getElementById("zoom-out").addEventListener("click", zoomOut);
    document.getElementById("zoom-reset").addEventListener("click", zoomReset);
    
    // Modal controls
    document.querySelector(".close-modal").addEventListener("click", closeModal);
    document.getElementById("close-modal").addEventListener("click", closeModal);
    document.getElementById("highlight-cycle").addEventListener("click", highlightCycle);
});

function setupEventListeners() {
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('line') || 
            e.target.classList.contains('triangle-marker')) {
            const id = e.target.id;
            if (id && confirm('Delete this edge?')) {
                deleteEdgeById(id);
            }
        }
    });
    
    document.addEventListener('mouseover', function(e) {
        if (e.target.classList.contains('line') || 
            e.target.classList.contains('triangle-marker')) {
            showTooltip(e.target.title, e);
        } else if (e.target.id && (e.target.id.startsWith('P') || e.target.id.startsWith('R'))) {
            const nodeType = e.target.id.startsWith('P') ? 'Process' : 'Resource';
            const nodeNum = e.target.id.substring(1);
            const tipText = `${nodeType} ${nodeNum}\nDrag to reposition`;
            showTooltip(tipText, e);
        }
    });
    
    document.addEventListener('mouseout', function() {
        hideTooltip();
    });
    
    document.addEventListener('mousemove', function(e) {
        updateTooltipPosition(e);
    });
}

function initTooltip() {
    tooltip = document.getElementById('tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'tooltip';
        tooltip.className = 'tooltip';
        document.body.appendChild(tooltip);
    }
}

/////////////////////////////
// TOOLTIP FUNCTIONS
/////////////////////////////

function showTooltip(text, event) {
    if (!tooltip) return;
    
    tooltip.innerHTML = text.replace('\n', '<br>');
    tooltip.style.display = 'block';
    updateTooltipPosition(event);
}

function hideTooltip() {
    if (!tooltip) return;
    tooltip.style.display = 'none';
}

function updateTooltipPosition(event) {
    if (!tooltip || tooltip.style.display === 'none') return;
    
    const padding = 15; // Distance from cursor
    const x = event.clientX + padding;
    const y = event.clientY + padding;
    
    const tooltipRect = tooltip.getBoundingClientRect();
    const maxX = window.innerWidth - tooltipRect.width - padding;
    const maxY = window.innerHeight - tooltipRect.height - padding;
    
    tooltip.style.left = Math.min(x, maxX) + 'px';
    tooltip.style.top = Math.min(y, maxY) + 'px';
}

/////////////////////////////
// DRAG & DROP FUNCTIONS
/////////////////////////////

function makeDraggable(element) {
    element.setAttribute("draggable", "true");

    element.addEventListener("dragstart", function(e) {
        const rect = element.getBoundingClientRect();
        e.dataTransfer.setData("text/plain", element.id);
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        e.dataTransfer.setData("offsetX", offsetX);
        e.dataTransfer.setData("offsetY", offsetY);
        
        element.classList.add('dragging');
    });

    element.addEventListener("dragend", function() {
        element.classList.remove('dragging');
        updateConnectedLines(element.id);
    });
}

function updateConnectedLines(elementId) {
    const requestLinesFrom = document.querySelectorAll(`[id^="L${elementId}Req"]`);
    const requestLinesTo = document.querySelectorAll(`[id*="Req${elementId}"]`);
    const allocLinesFrom = document.querySelectorAll(`[id^="L${elementId}Aloc"]`);
    const allocLinesTo = document.querySelectorAll(`[id*="Aloc${elementId}"]`);
    
    requestLinesFrom.forEach(line => {
        const lineId = line.id;
        const targetId = lineId.split("Req")[1];
        line.remove();
        let markerElem = document.getElementById(`M${elementId}Req${targetId}`);
        if (markerElem) markerElem.remove();
        drawLine(elementId, targetId, 1);
    });
    
    allocLinesFrom.forEach(line => {
        const lineId = line.id;
        const targetId = lineId.split("Aloc")[1];
        line.remove();
        let markerElem = document.getElementById(`M${elementId}Aloc${targetId}`);
        if (markerElem) markerElem.remove();
        drawLine(elementId, targetId, 0);
    });
    
    requestLinesTo.forEach(line => {
        const lineId = line.id;
        const sourceId = lineId.split("L")[1].split("Req")[0];
        line.remove();
        let markerElem = document.getElementById(`M${sourceId}Req${elementId}`);
        if (markerElem) markerElem.remove();
        drawLine(sourceId, elementId, 1);
    });
    
    allocLinesTo.forEach(line => {
        const lineId = line.id;
        const sourceId = lineId.split("L")[1].split("Aloc")[0];
        line.remove();
        let markerElem = document.getElementById(`M${sourceId}Aloc${elementId}`);
        if (markerElem) markerElem.remove();
        drawLine(sourceId, elementId, 0);
    });
}

function initWorkspaceDroppable(containerSelector) {
    const container = document.querySelector(containerSelector);

    container.addEventListener("dragover", function(e) {
        e.preventDefault(); 
    });

    container.addEventListener("drop", function(e) {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        const offsetX = Number(e.dataTransfer.getData("offsetX"));
        const offsetY = Number(e.dataTransfer.getData("offsetY"));
        const draggableElement = document.getElementById(id);

        const containerRect = container.getBoundingClientRect();
        const newLeft = (e.clientX - containerRect.left - offsetX) / currentZoom;
        const newTop = (e.clientY - containerRect.top - offsetY) / currentZoom;

        const maxX = containerRect.width / currentZoom - draggableElement.offsetWidth;
        const maxY = containerRect.height / currentZoom - draggableElement.offsetHeight;
        
        const boundedLeft = Math.max(0, Math.min(newLeft, maxX));
        const boundedTop = Math.max(0, Math.min(newTop, maxY));

        draggableElement.style.position = "absolute";
        draggableElement.style.left = boundedLeft + "px";
        draggableElement.style.top = boundedTop + "px";
    });
}

/////////////////////////////
// ZOOM FUNCTIONS
/////////////////////////////

function zoomIn() {
    if (currentZoom < 2.5) {
        currentZoom += 0.1;
        applyZoom();
    }
}

function zoomOut() {
    if (currentZoom > 0.5) {
        currentZoom -= 0.1;
        applyZoom();
    }
}

function zoomReset() {
    currentZoom = 1;
    applyZoom();
}

function applyZoom() {
    const workspace = document.getElementById('workspace');
    workspace.style.transform = `scale(${currentZoom})`;
    workspace.style.transformOrigin = 'center center';
    
    // Update all lines when zooming
    const elements = document.querySelectorAll('.circle, .rect');
    elements.forEach(element => {
        updateConnectedLines(element.id);
    });
}

/////////////////////////////
// DELETE EDGE FUNCTIONS
/////////////////////////////

function deleteEdgeById(id) {
    let sourceId, targetId, edgeType;
    if (id.includes('Req')) {
        [sourceId, targetId] = id.replace(/^[LM]/, '').split('Req');
        edgeType = 'request';
    } else if (id.includes('Aloc')) {
        [sourceId, targetId] = id.replace(/^[LM]/, '').split('Aloc');
        edgeType = 'allocation';
    } else {
        return; // Invalid id format
    }
    
    const lineId = 'L' + sourceId + (edgeType === 'request' ? 'Req' : 'Aloc') + targetId;
    const markerId = 'M' + sourceId + (edgeType === 'request' ? 'Req' : 'Aloc') + targetId;
    const line = document.getElementById(lineId);
    const marker = document.getElementById(markerId);
    
    if (line) line.remove();
    if (marker) marker.remove();
    
    if (edgeType === 'request') {
        const process = parseInt(sourceId.substring(1));
        const resource = parseInt(targetId.substring(1));
        if (!isNaN(process) && !isNaN(resource)) {
            rag[process - 1][resource - 1]--;
            existingEdges.delete(`req_P${process}_R${resource}`);
        }
    } else {
        const resource = parseInt(sourceId.substring(1));
        const process = parseInt(targetId.substring(1));
        if (!isNaN(process) && !isNaN(resource)) {
            rag[process - 1][resource - 1]++;
            existingEdges.delete(`alloc_R${resource}_P${process}`);
        }
    }
}

function deleteEdge() {
    const sourceEl = document.getElementById('delete-edge-source');
    const targetEl = document.getElementById('delete-edge-target');
    
    if (!sourceEl || !targetEl) return;
    
    const source = sourceEl.value.trim();
    const target = targetEl.value.trim();
    
    if (!source || !target) {
        alert('Please enter both source and target');
        return;
    }
    
    let lineId, markerId;
    
    if (source.startsWith('P') && target.startsWith('R')) {
        // Request edge.
        lineId = `L${source}Req${target}`;
        markerId = `M${source}Req${target}`;
    } else if (source.startsWith('R') && target.startsWith('P')) {
        // Allocation edge.
        lineId = `L${source}Aloc${target}`;
        markerId = `M${source}Aloc${target}`;
    } else {
        alert('Invalid format. Use P1, R1, etc.');
        return;
    }
    
    const line = document.getElementById(lineId);
    const marker = document.getElementById(markerId);
    
    if (!line && !marker) {
        alert('Edge not found');
        return;
    }
    
    if (source.startsWith('P')) {
        const process = parseInt(source.substring(1));
        const resource = parseInt(target.substring(1));
        rag[process - 1][resource - 1]--;
        existingEdges.delete(`req_P${process}_R${resource}`);
    } else {
        const resource = parseInt(source.substring(1));
        const process = parseInt(target.substring(1));
        rag[process - 1][resource - 1]++;
        existingEdges.delete(`alloc_R${resource}_P${process}`);
    }
    
    if (line) line.remove();
    if (marker) marker.remove();
    
    // Clear input fields.
    sourceEl.value = '';
    targetEl.value = '';
}

/////////////////////////////
// CREATE PROCESS / RESOURCE
/////////////////////////////

function createProcess() {
    const workspaceContainer = document.getElementById("workspace");
    
    const circle = document.createElement("div");
    circle.className = "circle appear-anim";
    circle.id = "P" + (num_processes + 1);
    circle.innerText = "P" + (num_processes + 1);
    
    circle.style.position = 'absolute';
    circle.style.left = (Math.floor(Math.random() * 200) + 50) + 'px';
    circle.style.top = (Math.floor(Math.random() * 200) + 50) + 'px';
    
    makeDraggable(circle);
    
    workspaceContainer.appendChild(circle);
    num_processes++;
    
    // Update RAG matrix
    if (rag.length === 0) {
        rag.push(new Array(num_resources).fill(0));
    } else {
        rag.push(new Array(Math.max(num_resources, 1)).fill(0));
    }
}

function createResource() {
    const workspaceContainer = document.getElementById("workspace");
    
    const rect = document.createElement("div");
    rect.className = "rect appear-anim";
    rect.id = "R" + (num_resources + 1);
    
    rect.style.position = 'absolute';
    rect.style.left = (Math.floor(Math.random() * 200) + 250) + 'px';
    rect.style.top = (Math.floor(Math.random() * 200) + 50) + 'px';
    
    makeDraggable(rect);

    const rectContainer = document.createElement("div");
    rectContainer.className = "resource-container";

    const dot_row = document.createElement("div");
    dot_row.className = "dot-row";

    const num_instances = parseInt(document.getElementById("num_res").value) || 1;
    resources.push(num_instances);
    
    // Create dots based on resource instances
    for (let i = 0; i < num_instances; i++) {
        const dot = document.createElement("div");
        dot.className = "dot";
        dot_row.appendChild(dot);
    }

    rectContainer.appendChild(dot_row);
    rectContainer.appendChild(document.createTextNode("R" + (num_resources + 1)));
    rect.appendChild(rectContainer);
    workspaceContainer.appendChild(rect);
    num_resources++;

    // Update RAG matrix for all processes
    for (let i = 0; i < num_processes; i++) {
        if (!rag[i]) {
            rag[i] = [];
        }
        rag[i].push(0);
    }
}

/////////////////////////////
// EDGE CREATION & DRAWING
/////////////////////////////

function createRequestEdge() {
    const process = parseInt(document.getElementById("rpro").value) || 1;
    const resource = parseInt(document.getElementById("rres").value) || 1;

    if (process > num_processes || resource > num_resources) {
        alert("Process or Resource does not exist!");
        return;
    }
    
    const edgeKey = `req_P${process}_R${resource}`;
    if (existingEdges.has(edgeKey)) {
        alert("This request edge already exists!");
        return;
    }
    
    existingEdges.add(edgeKey);
    rag[process - 1][resource - 1]++;
    drawLine("P" + process, "R" + resource, 1);
}

function createAllocationEdge() {
    const process = parseInt(document.getElementById("apro").value) || 1;
    const resource = parseInt(document.getElementById("ares").value) || 1;

    if (process > num_processes || resource > num_resources) {
        alert("Process or Resource does not exist!");
        return;
    }
    
    const edgeKey = `alloc_R${resource}_P${process}`;
    if (existingEdges.has(edgeKey)) {
        alert("This allocation edge already exists!");
        return;
    }
    
    existingEdges.add(edgeKey);
    rag[process - 1][resource - 1]--;
    drawLine("R" + resource, "P" + process, 0);
}

function drawLine(a, b, rqe) {
    var a1 = document.getElementById(a);
    var coords1 = cumulativeOffset(a1);
    var x1 = coords1.left + (a.startsWith('P') ? 37 : 60);
    var y1 = coords1.top + (a.startsWith('P') ? 37 : 30);

    var a2 = document.getElementById(b);
    var coords2 = cumulativeOffset(a2);
    var x2 = coords2.left + (b.startsWith('P') ? 37 : 60);
    var y2 = coords2.top + (b.startsWith('P') ? 37 : 30);
    
    var angle = Math.atan2(y2 - y1, x2 - x1);
    var length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

    const shortening = (b.startsWith('P') ? 15 : 20);
    length = length - shortening;

    var lineElement = document.createElement('div');
    lineElement.style.top = y1 + 'px';
    lineElement.style.left = x1 + 'px';
    lineElement.style.width = length + 'px';
    lineElement.style.transformOrigin = 'left center';
    lineElement.style.transform = 'rotate(' + angle + 'rad)';
    lineElement.className = 'line';
    if (rqe == 1) {
        lineElement.id = "L" + a + "Req" + b;
        lineElement.title = "Request edge: " + a + " → " + b;
        lineElement.setAttribute('data-type', 'request');
    } else {
        lineElement.id = "L" + a + "Aloc" + b;
        lineElement.title = "Allocation edge: " + a + " → " + b;
        lineElement.setAttribute('data-type', 'allocation');
    }
    document.body.appendChild(lineElement);

    var endX = x1 + Math.cos(angle) * length;
    var endY = y1 + Math.sin(angle) * length;

    var marker = document.createElement('div');
    marker.className = 'triangle-marker';

    marker.style.top = (endY - 6) + 'px';
    marker.style.left = (endX - 6) + 'px';
    marker.style.transformOrigin = 'center';
    marker.style.transform = 'rotate(' + (angle + Math.PI/2 + Math.PI) + 'rad)';
    
    if (rqe == 1) {
        marker.id = "M" + a + "Req" + b;
        marker.title = "Request edge: " + a + " → " + b;
        marker.setAttribute('data-type', 'request');
    } else {
        marker.id = "M" + a + "Aloc" + b;
        marker.title = "Allocation edge: " + a + " → " + b;
        marker.setAttribute('data-type', 'allocation');
    }
    document.body.appendChild(marker);
}

/////////////////////////////
// HELPER: CUMULATIVE OFFSET
/////////////////////////////

var cumulativeOffset = function(element) {
    var top = 0, left = 0;
    do {
        top += element.offsetTop  || 0;
        left += element.offsetLeft || 0;
        element = element.offsetParent;
    } while(element);

    return { top: top, left: left };
};

/////////////////////////////
// DEADLOCK DETECTION
/////////////////////////////

function detectDeadlock() {
    disableInputs(true);
    resetUI();

    // Method selection - RAG or Wait-For Graph
    const method = document.getElementById("algorithm-select").value;
    
    // Build Wait-For Graph and Blocking Resource Graph
    wfg = new Array(num_processes);
    bfg = new Array(num_processes);
    for(let i = 0; i < num_processes; i++) {
        wfg[i] = new Array(num_processes).fill(0);
        bfg[i] = new Array(num_processes).fill(-1);
    }

    for(let i = 0; i < num_processes; i++) {
        for(let j = 0; j < num_resources; j++) {
            if(rag[i][j] > 0) { // Process i requests resource j
                for(let k = 0; k < num_processes; k++) {
                    if(i != k) {
                        if(rag[k][j] < 0) { // Process k holds resource j
                            bfg[i][k] = j;
                            wfg[i][k] = 1;
                        }
                    }
                }
            }
        }
    }

    detectCycle();
    if(cycle == 1) {
        var resourcesInCycle = [];
        for(let i = 0; i < cycleNodes.length; i++) {
            var j = (i + 1) % cycleNodes.length;
            const a = cycleNodes[i];
            const b = cycleNodes[j];
            resourcesInCycle.push(parseInt(bfg[a][b]));
        }

        var deadlock = 0;
        for(let m = 0; m < resourcesInCycle.length; m++) {
            var i = resourcesInCycle[m];
            var requests = 0;
            var allocations = 0;
            
            for(let j = 0; j < num_processes; j++) {
                if(parseInt(rag[j][i]) >= 1) requests += parseInt(rag[j][i]);
                else if(parseInt(rag[j][i]) <= -1) allocations -= parseInt(rag[j][i]);
            }

            if(parseInt(resources[i]) - allocations < requests) {
                deadlock = 1;
                break;
            }
        }

        const resultBox = document.getElementById("result");
        
        if(deadlock == 0) {
            resultBox.innerHTML = '<div class="status-indicator"></div><span class="status-text">Deadlock may exist</span>';
            resultBox.classList.add('warning');
            resultBox.classList.remove('success', 'danger');
        }
        else {
            highlightDeadlockedComponents(cycleNodes);
            
            resultBox.innerHTML = '<div class="status-indicator"></div><span class="status-text">Deadlock detected</span>';
            resultBox.classList.add('danger');
            resultBox.classList.remove('success', 'warning');
            
            // Show the deadlock modal with cycle information
            showDeadlockModal(cycleNodes);
        }
    }
    else {
        const resultBox = document.getElementById("result");
        resultBox.innerHTML = '<div class="status-indicator"></div><span class="status-text">The System is Deadlock Free</span>';
        resultBox.classList.add('success');
        resultBox.classList.remove('warning', 'danger');
    }

    disableInputs(false);
}

function highlightDeadlockedComponents(cycleNodes) {
    const deadlockedNodes = new Set();
    
    for(let i = 0; i < cycleNodes.length; i++) {
        var j = (i + 1) % cycleNodes.length;
        const a = cycleNodes[i];
        const b = cycleNodes[j];
        const k = parseInt(bfg[a][b]);

        // Add nodes to the deadlocked set
        deadlockedNodes.add("P" + (a + 1));
        deadlockedNodes.add("R" + (k + 1));
        deadlockedNodes.add("P" + (b + 1));
        
        const reqLineId = "LP" + (a + 1) + "Req" + "R" + (k + 1);
        const reqMarkerID = "MP" + (a + 1) + "Req" + "R" + (k + 1);
        const allocLineId = "LR" + (k + 1) + "Aloc" + "P" + (b + 1);
        const allocMarkerId = "MR" + (k + 1) + "Aloc" + "P" + (b + 1);
        
        const reqLine = document.getElementById(reqLineId);
        const reqMarker = document.getElementById(reqMarkerID);
        const allocLine = document.getElementById(allocLineId);
        const allocMarker = document.getElementById(allocMarkerId);
        
        if (reqLine) {
            reqLine.classList.add('deadlocked');
        }
        if (reqMarker) {
            reqMarker.classList.add('deadlocked');
        }
        if (allocLine) {
            allocLine.classList.add('deadlocked');
        }
        if (allocMarker) {
            allocMarker.classList.add('deadlocked');
        }
    }
    
    deadlockedNodes.forEach(nodeId => {
        const nodeElem = document.getElementById(nodeId);
        if (nodeElem) {
            nodeElem.classList.add('deadlocked');
        }
    });
}

function resetUI() {
    const lines = document.querySelectorAll('.line');
    lines.forEach(line => {
        line.classList.remove('deadlocked', 'highlighted');
    });
    
    const arrowHeads = document.querySelectorAll('.triangle-marker');
    arrowHeads.forEach(arrow => {
        arrow.classList.remove('deadlocked', 'highlighted');
    });
    
    const circles = document.querySelectorAll('.circle');
    circles.forEach(circle => {
        circle.classList.remove('deadlocked');
    });
    
    const rects = document.querySelectorAll('.rect');
    rects.forEach(rect => {
        rect.classList.remove('deadlocked');
    });
    
    const resultBox = document.getElementById("result");
    resultBox.classList.remove('success', 'warning', 'danger');
    resultBox.innerHTML = '<div class="status-indicator"></div><span class="status-text">No deadlock detection run yet</span>';
}

function detectCycle() {
    visited = new Array(num_processes).fill(0);
    parents = new Array(num_processes).fill(-1);
    cycle = 0;
    cycleNodes = [];

    for(let i = 0; i < num_processes; i++) {
        if(visited[i] == 0) {
            recursiveDFS(i, i, parents);
            if(cycle == 1) break;
        }
    }
}

function recursiveDFS(node, parent, parents) {
    node = parseInt(node);
    if(visited[node] == -1) {
        return;
    }
    if(visited[node] == 1) {
        var cur = parseInt(parent);
        cycleNodes.push(cur);
        while(cur != node) {
            cur = parents[cur];
            cycleNodes.push(cur);
        }
        cycleNodes.reverse();
        cycle = 1;
        return;
    }
    parents[node] = parent;
    visited[node] = 1;
    for(let i = 0; i < num_processes; i++) {
        if(wfg[node][i] == 1) {
            recursiveDFS(i, node, parents);
        }
        if(cycle == 1) break;
    }
    visited[node] = -1;
}

/////////////////////////////
// MODAL FUNCTIONS
/////////////////////////////

function showDeadlockModal(cycleNodes) {
    const modal = document.getElementById('deadlock-modal');
    const cycleInfo = modal.querySelector('.cycle-info');
    
    let cycleText = '<strong>Deadlock Cycle:</strong><div class="cycle-path">';
    
    for(let i = 0; i < cycleNodes.length; i++) {
        var j = (i + 1) % cycleNodes.length;
        const a = cycleNodes[i];
        const b = cycleNodes[j];
        const k = bfg[a][b];
        
        cycleText += `P${a+1} → R${k+1} → P${b+1}`;
        if (i < cycleNodes.length - 1) {
            cycleText += ' → ';
        }
    }
    
    cycleText += '</div>';
    cycleText += '<p>This is a circular wait condition that is causing a deadlock.</p>';
    
    cycleInfo.innerHTML = cycleText;
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('deadlock-modal');
    modal.style.display = 'none';
}

function highlightCycle() {
    closeModal();
    
    // Find all deadlocked edges
    const deadlockedEdges = document.querySelectorAll('.line.deadlocked, .triangle-marker.deadlocked');
    deadlockedEdges.forEach(edge => {
        edge.classList.add('highlighted');
    });
    
    // Add animation to highlight the cycle
    setTimeout(() => {
        deadlockedEdges.forEach(edge => {
            edge.classList.remove('highlighted');
        });
    }, 5000);
}

/////////////////////////////
// RESET WORKSPACE
/////////////////////////////

function resetWorkspace() {
    if (!confirm("Are you sure you want to reset the workspace? All nodes and edges will be removed.")) {
        return;
    }
    
    const workspaceContainer = document.getElementById("workspace");
    const nodeElements = workspaceContainer.querySelectorAll('.circle, .rect');
    nodeElements.forEach(node => node.remove());
    
    const lineElements = document.querySelectorAll('.line, .triangle-marker');
    lineElements.forEach(line => line.remove());
    
    num_processes = 0;
    num_resources = 0;
    resources = [];
    rag = [];
    wfg = [];
    bfg = [];
    existingEdges.clear();
    
    resetUI();
    
    // Reset input fields
    document.getElementById('rpro').value = '';
    document.getElementById('rres').value = '';
    document.getElementById('apro').value = '';
    document.getElementById('ares').value = '';
    document.getElementById('num_res').value = '1';
    document.getElementById('delete-edge-source').value = '';
    document.getElementById('delete-edge-target').value = '';
    
    // Reset zoom
    zoomReset();
}

/////////////////////////////
// UTILITY FUNCTIONS
/////////////////////////////

function disableInputs(disabled) {
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        if (button.id !== 'close-modal' && button.id !== 'highlight-cycle') {
            button.disabled = disabled;
        }
    });
    
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        input.disabled = disabled;
    });
    
    const selects = document.querySelectorAll('select');
    selects.forEach(select => {
        select.disabled = disabled;
    });
}

// Adding export functionality - a nice addition for users to save their work
function exportGraph() {
    const graphData = {
        processes: num_processes,
        resources: resources,
        rag: rag,
        nodePositions: {}
    };
    
    // Get positions of all nodes
    const nodes = document.querySelectorAll('.circle, .rect');
    nodes.forEach(node => {
        graphData.nodePositions[node.id] = {
            left: node.style.left,
            top: node.style.top
        };
    });
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(graphData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "deadlock_graph.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

// Import functionality
function importGraph(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const graphData = JSON.parse(e.target.result);
            loadGraph(graphData);
        } catch (error) {
            alert('Error importing graph: ' + error.message);
        }
    };
    reader.readAsText(file);
}

function loadGraph(graphData) {
    // First reset the workspace
    resetWorkspace();
    
    // Create processes
    for (let i = 0; i < graphData.processes; i++) {
        createProcess();
    }
    
    // Create resources
    for (let i = 0; i < graphData.resources.length; i++) {
        document.getElementById("num_res").value = graphData.resources[i];
        createResource();
    }
    
    // Position nodes
    for (const nodeId in graphData.nodePositions) {
        const node = document.getElementById(nodeId);
        if (node) {
            node.style.left = graphData.nodePositions[nodeId].left;
            node.style.top = graphData.nodePositions[nodeId].top;
        }
    }
    
    // Create edges based on RAG
    for (let i = 0; i < graphData.rag.length; i++) {
        for (let j = 0; j < graphData.rag[i].length; j++) {
            const value = graphData.rag[i][j];
            if (value > 0) {
                // Request edges
                for (let k = 0; k < value; k++) {
                    rag[i][j]++;
                    const processId = "P" + (i + 1);
                    const resourceId = "R" + (j + 1);
                    const edgeKey = `req_${processId}_${resourceId}`;
                    existingEdges.add(edgeKey);
                    drawLine(processId, resourceId, 1);
                }
            } else if (value < 0) {
                // Allocation edges
                for (let k = 0; k < Math.abs(value); k++) {
                    rag[i][j]--;
                    const processId = "P" + (i + 1);
                    const resourceId = "R" + (j + 1);
                    const edgeKey = `alloc_${resourceId}_${processId}`;
                    existingEdges.add(edgeKey);
                    drawLine(resourceId, processId, 0);
                }
            }
        }
    }
}

// Add these functions to the event listeners in the DOMContentLoaded section
document.addEventListener('DOMContentLoaded', function() {
    // Add existing listeners...
    
    // Export and import functionality
    const exportBtn = document.getElementById('export-graph');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportGraph);
    }
    
    const importInput = document.getElementById('import-graph');
    if (importInput) {
        importInput.addEventListener('change', importGraph);
    }
});

/////////////////////////////
// OPTIONAL ENHANCEMENT: UNDO/REDO FUNCTIONALITY
/////////////////////////////

let undoStack = [];
let redoStack = [];

function saveState() {
    const currentState = {
        processes: num_processes,
        resources: [...resources],
        rag: JSON.parse(JSON.stringify(rag)),
        nodePositions: {},
        edges: Array.from(existingEdges)
    };
    
    // Get positions of all nodes
    const nodes = document.querySelectorAll('.circle, .rect');
    nodes.forEach(node => {
        currentState.nodePositions[node.id] = {
            left: node.style.left,
            top: node.style.top
        };
    });
    
    undoStack.push(currentState);
    redoStack = []; // Clear redo stack when a new action is performed
    
    // Limit undo stack size
    if (undoStack.length > 20) {
        undoStack.shift();
    }
    
    updateUndoRedoButtons();
}

function undo() {
    if (undoStack.length <= 1) return; // Keep at least one state
    
    const currentState = undoStack.pop();
    redoStack.push(currentState);
    const previousState = undoStack[undoStack.length - 1];
    
    // Load the previous state
    loadState(previousState);
    updateUndoRedoButtons();
}

function redo() {
    if (redoStack.length === 0) return;
    
    const nextState = redoStack.pop();
    undoStack.push(nextState);
    
    // Load the next state
    loadState(nextState);
    updateUndoRedoButtons();
}

function loadState(state) {
    // First reset the workspace
    resetWorkspace();
    
    // Restore processes, resources, and RAG
    num_processes = state.processes;
    resources = [...state.resources];
    rag = JSON.parse(JSON.stringify(state.rag));
    
    // Create processes
    for (let i = 0; i < state.processes; i++) {
        createProcess();
    }
    
    // Create resources
    for (let i = 0; i < state.resources.length; i++) {
        document.getElementById("num_res").value = state.resources[i];
        createResource();
    }
    
    // Position nodes
    for (const nodeId in state.nodePositions) {
        const node = document.getElementById(nodeId);
        if (node) {
            node.style.left = state.nodePositions[nodeId].left;
            node.style.top = state.nodePositions[nodeId].top;
        }
    }
    
    // Restore edges
    existingEdges = new Set(state.edges);
    
    for (const edge of existingEdges) {
        if (edge.startsWith('req_')) {
            const [_, source, target] = edge.split('_');
            drawLine(source, target, 1);
        } else if (edge.startsWith('alloc_')) {
            const [_, source, target] = edge.split('_');
            drawLine(source, target, 0);
        }
    }
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    
    if (undoBtn) {
        undoBtn.disabled = undoStack.length <= 1;
    }
    
    if (redoBtn) {
        redoBtn.disabled = redoStack.length === 0;
    }
}

// Add these functions to the event listeners
window.addEventListener('DOMContentLoaded', () => {
    initWorkspaceDroppable(".workspace-container");
    setupEventListeners();
    initTooltip();
  
    // Undo/Redo
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.addEventListener('click', undo);
  
    const redoBtn = document.getElementById('redo-btn');
    if (redoBtn) redoBtn.addEventListener('click', redo);
  
    // Initialize first state
    saveState();
  
    // After every user action, push a new state
    const actionButtons = ['cprocess', 'cres', 'creqedge', 'calocedge', 'delete-edge'];
    actionButtons.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        // this will *add* without overriding your existing handler
        btn.addEventListener('click', saveState);
      }
    });
});
  
