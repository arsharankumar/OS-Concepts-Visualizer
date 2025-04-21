document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const totalBlocksInput = document.getElementById('total-blocks');
    const numFilesInput = document.getElementById('num-files');
    const fileSizesContainer = document.getElementById('file-sizes-container');
    const allocationMethodSelect = document.getElementById('allocation-method');
    const runSimulationBtn = document.getElementById('run-simulation');
    const resetSimulationBtn = document.getElementById('reset-simulation');
    const diskContainer = document.getElementById('disk-container');
    const allocationInfo = document.getElementById('allocation-info');

    // Variables
    const colors = [
        '#FF6B6B', '#4ECDC4', '#FFD166', '#06D6A0', '#118AB2', 
        '#F7B801', '#7F7EFF', '#EF476F', '#3BCEAC', '#FC7307'
    ];
    let diskBlocks = [];
    let files = [];
    let initialSetupComplete = false;

    // Initialize
    initialize();

    // Event Listeners
    numFilesInput.addEventListener('change', updateFileSizeInputs);
    runSimulationBtn.addEventListener('click', runSimulation);
    resetSimulationBtn.addEventListener('click', resetSimulation);

    // Functions
    function initialize() {
        updateFileSizeInputs();
        setupInitialDiskBlocks();
    }

    function updateFileSizeInputs() {
        const numFiles = parseInt(numFilesInput.value);
        fileSizesContainer.innerHTML = '';

        for (let i = 0; i < numFiles; i++) {
            const fileInput = document.createElement('div');
            fileInput.classList.add('file-size-input');
            fileInput.innerHTML = `
                <label for="file-size-${i}">File ${i + 1} Size (blocks):</label>
                <input type="number" id="file-size-${i}" class="file-size" min="1" max="20" value="${Math.floor(Math.random() * 5) + 2}">
            `;
            fileSizesContainer.appendChild(fileInput);
        }
    }

    function setupInitialDiskBlocks() {
        // Clear previous setup
        diskBlocks = [];
        diskContainer.innerHTML = '';
        allocationInfo.innerHTML = '<p>Click on disk blocks to mark them as already allocated (busy) before running the simulation.</p>';
        
        // Get total blocks
        const totalBlocks = parseInt(totalBlocksInput.value);
        
        // Initialize disk blocks
        for (let i = 0; i < totalBlocks; i++) {
            diskBlocks.push({
                id: i,
                allocated: false,
                fileId: null,
                isIndex: false,
                nextBlock: null,
                initiallyBusy: false
            });
        }
        
        // Render clickable disk blocks for setup
        renderInitialDiskBlocks();
        
        // Update button text
        runSimulationBtn.textContent = "Run Simulation";
        initialSetupComplete = true;
    }

    function renderInitialDiskBlocks() {
        diskContainer.innerHTML = '';
        
        for (let i = 0; i < diskBlocks.length; i++) {
            const block = diskBlocks[i];
            const blockElement = document.createElement('div');
            blockElement.classList.add('disk-block');
            blockElement.textContent = i;
            
            if (block.initiallyBusy) {
                blockElement.classList.add('busy');
                blockElement.innerHTML = `<span>${i}</span><span class="busy-mark">X</span>`;
            } else {
                blockElement.classList.add('free');
            }
            
            // Add click event to toggle busy state
            blockElement.addEventListener('click', function() {
                toggleBlockBusyState(i);
            });
            
            diskContainer.appendChild(blockElement);
        }

        // Add legend
        const legend = document.createElement('div');
        legend.classList.add('legend');
        
        // Add free and busy blocks to legend
        const freeItem = document.createElement('div');
        freeItem.classList.add('legend-item');
        freeItem.innerHTML = `
            <div class="legend-color" style="background-color: #eee;"></div>
            <span>Free Block</span>
        `;
        legend.appendChild(freeItem);
        
        const busyItem = document.createElement('div');
        busyItem.classList.add('legend-item');
        busyItem.innerHTML = `
            <div class="legend-color" style="background-color: #ff0000;"></div>
            <span>Already Allocated Block</span>
        `;
        legend.appendChild(busyItem);
        
        diskContainer.appendChild(legend);
    }

    function toggleBlockBusyState(blockId) {
        diskBlocks[blockId].initiallyBusy = !diskBlocks[blockId].initiallyBusy;
        diskBlocks[blockId].allocated = diskBlocks[blockId].initiallyBusy;
        renderInitialDiskBlocks();
    }

    function resetSimulation() {
        diskBlocks = [];
        files = [];
        initialSetupComplete = false;
        diskContainer.innerHTML = '';
        allocationInfo.innerHTML = '';
        updateFileSizeInputs();
        setupInitialDiskBlocks();
    }

    function runSimulation() {
        // If setup isn't complete yet or we need to reset for a new simulation
        if (!initialSetupComplete) {
            setupInitialDiskBlocks();
            return;
        }
        
        // Reset previous simulation but keep initially busy blocks
        files = [];
        
        // For each block, reset allocation but keep initiallyBusy flag
        for (let i = 0; i < diskBlocks.length; i++) {
            // If block was initially marked as busy, keep it allocated
            // Otherwise, reset allocation status
            if (!diskBlocks[i].initiallyBusy) {
                diskBlocks[i].allocated = false;
                diskBlocks[i].fileId = null;
                diskBlocks[i].isIndex = false;
                diskBlocks[i].nextBlock = null;
            }
        }

        // Get inputs
        const totalBlocks = diskBlocks.length;
        const numFiles = parseInt(numFilesInput.value);
        const allocationMethod = allocationMethodSelect.value;
        
        // Validate inputs
        if (numFiles < 1 || numFiles > 10 || isNaN(numFiles)) {
            alert('Number of files must be between 1 and 10');
            return;
        }

        // Count free blocks
        const freeBlocksCount = diskBlocks.filter(block => !block.allocated).length;

        // Create files with sizes
        const fileSizeInputs = document.querySelectorAll('.file-size');
        let totalFileSize = 0;
        
        for (let i = 0; i < numFiles; i++) {
            const size = parseInt(fileSizeInputs[i].value);
            
            if (size < 1 || isNaN(size)) {
                alert(`Invalid size for File ${i + 1}`);
                return;
            }
            
            files.push({
                id: i,
                name: `F${i + 1}`,
                size: size,
                color: colors[i % colors.length],
                blocks: []
            });
            
            totalFileSize += size;
        }

        // Add extra blocks for index blocks if using indexed allocation
        if (allocationMethod === 'indexed') {
            totalFileSize += numFiles; // One index block per file
        }

        // Check if there's enough space
        if (totalFileSize > freeBlocksCount) {
            alert(`Not enough free disk blocks for all files. Need ${totalFileSize} blocks, but only ${freeBlocksCount} are available.`);
            return;
        }

        // Allocate files based on method
        let allocationSuccess = false;
        
        switch(allocationMethod) {
            case 'contiguous':
                allocationSuccess = allocateContiguous();
                break;
            case 'linked':
                allocationSuccess = allocateLinked();
                break;
            case 'indexed':
                allocationSuccess = allocateIndexed();
                break;
        }
        
        if (!allocationSuccess) {
            return; // Allocation failed, error message already shown
        }

        // Render disk blocks
        renderDiskBlocks();
        
        // Display allocation info
        displayAllocationInfo(allocationMethod);
    }

    function allocateContiguous() {
        // For contiguous allocation, we need to find contiguous free blocks
        for (let file of files) {
            let allocated = false;
            
            for (let startBlock = 0; startBlock <= diskBlocks.length - file.size; startBlock++) {
                // Check if we have enough contiguous free blocks starting at startBlock
                let hasEnoughSpace = true;
                
                for (let j = 0; j < file.size; j++) {
                    if (diskBlocks[startBlock + j].allocated) {
                        hasEnoughSpace = false;
                        break;
                    }
                }
                
                if (hasEnoughSpace) {
                    // Allocate contiguous blocks
                    for (let j = 0; j < file.size; j++) {
                        diskBlocks[startBlock + j].allocated = true;
                        diskBlocks[startBlock + j].fileId = file.id;
                        file.blocks.push(startBlock + j);
                    }
                    
                    allocated = true;
                    break;
                }
            }
            
            if (!allocated) {
                alert(`Could not allocate contiguous space for File ${file.id + 1}. Although there are enough free blocks, they are not contiguous.`);
                resetSimulation();
                return false;
            }
        }
        return true;
    }

    function allocateLinked() {
        // For linked allocation, blocks can be anywhere on disk
        for (let file of files) {
            let remainingBlocks = file.size;
            let lastBlock = null;
            
            // Find free blocks and link them
            for (let i = 0; i < diskBlocks.length && remainingBlocks > 0; i++) {
                if (!diskBlocks[i].allocated) {
                    diskBlocks[i].allocated = true;
                    diskBlocks[i].fileId = file.id;
                    file.blocks.push(i);
                    
                    if (lastBlock !== null) {
                        diskBlocks[lastBlock].nextBlock = i;
                    }
                    
                    lastBlock = i;
                    remainingBlocks--;
                }
            }
            
            if (remainingBlocks > 0) {
                alert(`Could not allocate space for File ${file.id + 1}`);
                resetSimulation();
                return false;
            }
        }
        return true;
    }

    function allocateIndexed() {
        // For indexed allocation, allocate an index block first, then data blocks
        for (let file of files) {
            // Find a free block for the index
            let indexBlock = -1;
            
            for (let i = 0; i < diskBlocks.length; i++) {
                if (!diskBlocks[i].allocated) {
                    indexBlock = i;
                    diskBlocks[i].allocated = true;
                    diskBlocks[i].fileId = file.id;
                    diskBlocks[i].isIndex = true;
                    break;
                }
            }
            
            if (indexBlock === -1) {
                alert(`Could not allocate index block for File ${file.id + 1}`);
                resetSimulation();
                return false;
            }
            
            // Store index block
            file.indexBlock = indexBlock;
            
            // Find free blocks for data
            let dataBlocks = 0;
            
            for (let i = 0; i < diskBlocks.length && dataBlocks < file.size; i++) {
                if (!diskBlocks[i].allocated) {
                    diskBlocks[i].allocated = true;
                    diskBlocks[i].fileId = file.id;
                    file.blocks.push(i);
                    dataBlocks++;
                }
            }
            
            if (dataBlocks < file.size) {
                alert(`Could not allocate data blocks for File ${file.id + 1}`);
                resetSimulation();
                return false;
            }
        }
        return true;
    }

    function renderDiskBlocks() {
        diskContainer.innerHTML = '';
        
        for (let i = 0; i < diskBlocks.length; i++) {
            const block = diskBlocks[i];
            const blockElement = document.createElement('div');
            blockElement.classList.add('disk-block');
            
            if (block.initiallyBusy && !block.fileId) {
                // Initially busy block that hasn't been allocated to a file
                blockElement.classList.add('busy');
                blockElement.innerHTML = `<span>${i}</span><span class="busy-mark">X</span>`;
            } else if (block.allocated && block.fileId !== null) {
                // Block allocated to a file
                const file = files[block.fileId];
                blockElement.style.backgroundColor = file.color;
                blockElement.classList.add('allocated');
                blockElement.setAttribute('data-file', file.name);
                
                if (block.isIndex) {
                    blockElement.classList.add('index-block');
                    blockElement.textContent = `I${file.id + 1}`;
                } else {
                    blockElement.textContent = i;
                }
                
                // Add pointers for linked allocation
                if (block.nextBlock !== null) {
                    const pointer = document.createElement('div');
                    pointer.classList.add('pointer');
                    pointer.textContent = '→';
                    blockElement.appendChild(pointer);
                }
            } else {
                // Free block
                blockElement.classList.add('free');
                blockElement.textContent = i;
            }
            
            diskContainer.appendChild(blockElement);
        }

        // Add legend
        const legend = document.createElement('div');
        legend.classList.add('legend');
        
        // Add free block to legend
        const freeItem = document.createElement('div');
        freeItem.classList.add('legend-item');
        freeItem.innerHTML = `
            <div class="legend-color" style="background-color: #eee;"></div>
            <span>Free Block</span>
        `;
        legend.appendChild(freeItem);
        
        // Add busy block to legend
        const busyItem = document.createElement('div');
        busyItem.classList.add('legend-item');
        busyItem.innerHTML = `
            <div class="legend-color" style="background-color: #ff0000;"></div>
            <span>Already Allocated Block</span>
        `;
        legend.appendChild(busyItem);
        
        // Add file blocks to legend
        for (let file of files) {
            const fileItem = document.createElement('div');
            fileItem.classList.add('legend-item');
            fileItem.innerHTML = `
                <div class="legend-color" style="background-color: ${file.color};"></div>
                <span>${file.name}</span>
            `;
            legend.appendChild(fileItem);
        }
        
        // Add index block to legend if needed
        if (allocationMethodSelect.value === 'indexed') {
            const indexItem = document.createElement('div');
            indexItem.classList.add('legend-item');
            indexItem.innerHTML = `
                <div class="legend-color" style="background-color: #f8e0ff; border: 2px dashed #9932cc;"></div>
                <span>Index Block</span>
            `;
            legend.appendChild(indexItem);
        }
        
        diskContainer.appendChild(legend);
    }

    function displayAllocationInfo(method) {
        let html = `<h4>${getMethodFullName(method)} Allocation Details</h4>`;
        
        switch(method) {
            case 'contiguous':
                html += `<p>In contiguous allocation, each file occupies a set of contiguous blocks.</p>`;
                html += `<table class="allocation-table">
                            <tr>
                                <th>File</th>
                                <th>Starting Block</th>
                                <th>Length</th>
                                <th>Ending Block</th>
                            </tr>`;
                
                for (let file of files) {
                    html += `<tr>
                                <td>${file.name}</td>
                                <td>${file.blocks[0]}</td>
                                <td>${file.size}</td>
                                <td>${file.blocks[file.blocks.length - 1]}</td>
                            </tr>`;
                }
                
                html += `</table>`;
                break;
                
            case 'linked':
                html += `<p>In linked allocation, each block contains a pointer to the next block in the file.</p>`;
                html += `<table class="allocation-table">
                            <tr>
                                <th>File</th>
                                <th>Start Block</th>
                                <th>Block Chain</th>
                            </tr>`;
                
                for (let file of files) {
                    let blockChain = '';
                    for (let i = 0; i < file.blocks.length; i++) {
                        blockChain += file.blocks[i];
                        if (i < file.blocks.length - 1) {
                            blockChain += ' → ';
                        }
                    }
                    
                    html += `<tr>
                                <td>${file.name}</td>
                                <td>${file.blocks[0]}</td>
                                <td>${blockChain}</td>
                            </tr>`;
                }
                
                html += `</table>`;
                break;
                
            case 'indexed':
                html += `<p>In indexed allocation, each file has an index block containing pointers to the file's data blocks.</p>`;
                html += `<table class="allocation-table">
                            <tr>
                                <th>File</th>
                                <th>Index Block</th>
                                <th>Data Blocks</th>
                            </tr>`;
                
                for (let file of files) {
                    let dataBlocks = file.blocks.join(', ');
                    
                    html += `<tr>
                                <td>${file.name}</td>
                                <td>${file.indexBlock}</td>
                                <td>${dataBlocks}</td>
                            </tr>`;
                }
                
                html += `</table>`;
                break;
        }
        
        allocationInfo.innerHTML = html;
    }

    function getMethodFullName(method) {
        switch(method) {
            case 'contiguous':
                return 'Sequential (Contiguous)';
            case 'linked':
                return 'Linked';
            case 'indexed':
                return 'Indexed';
            default:
                return method;
        }
    }

    // Initialize disk blocks when total blocks changes
    totalBlocksInput.addEventListener('change', setupInitialDiskBlocks);
});
