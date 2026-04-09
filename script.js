import { JpxImage } from 'https://cdn.jsdelivr.net/npm/jpeg2000@1.1.1/+esm';
import { Buffer } from 'https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm';

// Configure the Dynamsoft BarcodeReader SDK License
Dynamsoft.DBR.BarcodeReader.license = "DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==";

// Mapping Aadhaar XML attributes to human-readable labels
const labelMap = {
    uid: "Aadhaar Number (UID)",
    name: "Full Name",
    gender: "Gender",
    yob: "Year of Birth",
    co: "Care Of",
    lm: "Landmark",
    loc: "Location",
    vtc: "Village / Town / City",
    po: "Post Office",
    dist: "District",
    state: "State",
    pc: "Pincode",
    dob: "Date of Birth"
};

// Elements
const dropZone = document.getElementById('drop-zone');
const uploadInput = document.getElementById('uploadImage');
const resultsContainer = document.getElementById("results");
const errorContainer = document.getElementById("error-message");
const loader = document.getElementById("loader");

// Handling drag and drop functionality
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults (e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

dropZone.addEventListener('drop', (e) => {
    let dt = e.dataTransfer;
    let files = dt.files;
    handleFiles(files);
});

uploadInput.addEventListener('change', function() {
    handleFiles(this.files);
});

async function handleFiles(files) {
    if (!files || files.length === 0) return;
    
    // Reset UI
    resultsContainer.innerHTML = '';
    resultsContainer.classList.add('hidden');
    errorContainer.innerHTML = '';
    errorContainer.classList.add('hidden');
    loader.classList.remove('hidden');
    
    try {
        let reader = await Dynamsoft.DBR.BarcodeReader.createInstance();
        let results = await reader.decode(files[0]);
        
        loader.classList.add('hidden');
        
        if (results.length === 0) {
            showError("No barcode detected! Please try uploading a clearer image or ensure the QR code is fully visible.");
            return;
        }

        for (let result of results) {
            console.log("Raw QR Data:", result.barcodeText);
            let hasData = false;
            
            // Check if it's the new Secure QR format (all digits and very long)
            if (/^\d+$/.test(result.barcodeText) && result.barcodeText.length > 500) {
                try {
                    // Convert big integer string to byte array
                    let bigIntStr = result.barcodeText;
                    let bigInt = BigInt(bigIntStr);
                    let hex = bigInt.toString(16);
                    if (hex.length % 2 !== 0) {
                        hex = '0' + hex;
                    }
                    let bytes = new Uint8Array(hex.length / 2);
                    for (let i = 0; i < bytes.length; i++) {
                        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
                    }
                    
                    // Decompress using pako
                    let decompressed = pako.inflate(bytes);
                    
                    // Decode byte array to iso-8859-1 text
                    let decoder = new TextDecoder('iso-8859-1');
                    let text = decoder.decode(decompressed);
                    
                    // The JPEG2000 image standard header is FF 4F FF 51. Look for this in the raw bytes!
                    let jp2Index = -1;
                    for (let i = 0; i < decompressed.length - 3; i++) {
                        if (decompressed[i] === 255 && decompressed[i+1] === 79 && decompressed[i+2] === 255 && decompressed[i+3] === 81) {
                            jp2Index = i;
                            break;
                        }
                    }
                    
                    // We only split the text portion UP TO the image to avoid mangling binary data
                    let textData = jp2Index !== -1 ? text.substring(0, jp2Index) : text;
                    let parts = textData.split(String.fromCharCode(255));
                    
                    function renderCard(label, value) {
                        return `<div class="result-card"><div class="result-label">${label}</div><div class="result-value">${value}</div></div>`;
                    }

                    if (parts.length > 3 && (parts[0] === 'V2' || parts[0] === 'V3' || parts[0].includes('V'))) {
                        if (parts.length > 2 && parts[2]) {
                            let refId = parts[2];
                            resultsContainer.insertAdjacentHTML('beforeend', renderCard("Reference ID", refId));
                            if (refId.length > 10) {
                                let last4 = refId.substring(0, 4);
                                resultsContainer.insertAdjacentHTML('beforeend', renderCard("Aadhaar Number", `<span style="font-family: monospace; letter-spacing: 2px;">XXXX XXXX ${last4}</span>`));
                            }
                        }
                        if (parts[3]) resultsContainer.insertAdjacentHTML('beforeend', renderCard("Name", parts[3]));
                        if (parts[5]) resultsContainer.insertAdjacentHTML('beforeend', renderCard("Gender", parts[5] === 'M' ? 'Male' : (parts[5] === 'F' ? 'Female' : parts[5])));
                        if (parts[4]) resultsContainer.insertAdjacentHTML('beforeend', renderCard("Date of Birth", parts[4]));
                        
                        // Combine Address components (indices 6 to 16)
                        let addressParts = [];
                        for (let i = 6; i <= 16; i++) {
                            if (parts[i] && parts[i].trim() !== '') {
                                addressParts.push(parts[i].trim());
                            }
                        }
                        if (addressParts.length > 0) {
                            resultsContainer.insertAdjacentHTML('beforeend', renderCard("Address", addressParts.join(', ')));
                        }
                        
                        // Determine Mobile / Email presence based on flag at index 1
                        let mobileEmailFlag = parseInt(parts[1], 10);
                        let ptr = 17;
                        
                        let hasMobile = false;
                        let hasEmail = false;
                        let mobileText = "No";
                        let emailText = "No";

                        if (mobileEmailFlag === 1) { // Only Email
                            hasEmail = true;
                            emailText = "Yes (Hashed)";
                            ptr++;
                        } else if (mobileEmailFlag === 2) { // Only Mobile
                            hasMobile = true;
                            mobileText = parts[ptr] ? `Yes (${parts[ptr]})` : "Yes";
                            ptr++;
                        } else if (mobileEmailFlag === 3) { // Both
                            hasMobile = true;
                            mobileText = parts[ptr] ? `Yes (${parts[ptr]})` : "Yes";
                            ptr++;
                            hasEmail = true;
                            emailText = parts[ptr] ? `Yes (Hashed)` : "Yes";
                            ptr++;
                        }
                        
                        resultsContainer.insertAdjacentHTML('beforeend', renderCard("Mobile Linked", mobileText));
                        resultsContainer.insertAdjacentHTML('beforeend', renderCard("Email Linked", emailText));
                        
                        // Extract exactly the image bytes and signature bytes
                        if (jp2Index !== -1 && decompressed.length > 256) {
                            let signatureIndex = decompressed.length - 256;
                            let imageBytes = decompressed.slice(jp2Index, signatureIndex);
                            
                            try {
                                let jpx = new JpxImage();
                                // JpxImage from jpeg2000 npm depends on Node Buffer methods like readUInt16BE
                                let nodeBuffer = Buffer.from(imageBytes.buffer, imageBytes.byteOffset, imageBytes.byteLength);
                                jpx.parse(nodeBuffer);
                                
                                let c = document.createElement('canvas');
                                c.width = jpx.width;
                                c.height = jpx.height;
                                let ctx = c.getContext('2d');
                                let imgData = ctx.createImageData(jpx.width, jpx.height);
                                let tiles = jpx.tiles[0].items;
                                
                                if (jpx.componentsCount === 3) {
                                    for (let i = 0, j = 0; i < tiles.length; i += 3, j += 4) {
                                        imgData.data[j] = tiles[i];         // R
                                        imgData.data[j+1] = tiles[i+1];     // G
                                        imgData.data[j+2] = tiles[i+2];     // B
                                        imgData.data[j+3] = 255;            // A
                                    }
                                } else if (jpx.componentsCount === 1) {
                                    for (let i = 0, j = 0; i < tiles.length; i += 1, j += 4) {
                                        imgData.data[j] = tiles[i];
                                        imgData.data[j+1] = tiles[i];
                                        imgData.data[j+2] = tiles[i];
                                        imgData.data[j+3] = 255;
                                    }
                                } else {
                                    imgData.data.set(tiles);
                                }
                                
                                ctx.putImageData(imgData, 0, 0);
                                let dataUrl = c.toDataURL('image/jpeg', 0.9);
                                
                                window.currentAadhaarImageJpg = dataUrl;
                                
                                let photoCard = `
                                    <div class="result-card" style="display: flex; flex-direction: column; align-items: start;">
                                        <div class="result-label">Photograph</div>
                                        <img src="${dataUrl}" style="max-height: 150px; border-radius: 8px; margin: 10px 0; border: 1px solid rgba(255,255,255,0.1);">
                                        <button onclick="downloadImageJpg()" style="background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; color: #38bdf8; padding: 6px 12px; border-radius: 6px; cursor: pointer; transition: 0.2s;">Save Image (.jpg)</button>
                                    </div>
                                `;
                                resultsContainer.insertAdjacentHTML('beforeend', photoCard);
                                
                            } catch (e) {
                                console.error("Could not decode JP2 natively:", e);
                                // Fallback to raw JP2 download if rendering fails
                                window.currentAadhaarImageBytes = imageBytes;
                                let photoCard = `
                                    <div class="result-card">
                                        <div class="result-label">Photograph</div>
                                        <div class="result-value" style="display: flex; flex-direction: column; gap: 10px; align-items: start;">
                                            <span style="font-size: 0.85rem; opacity: 0.8; color: #ef4444;">[ Render Error: ${e.message} ]</span>
                                            <button onclick="downloadImage()" style="background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; color: #38bdf8; padding: 6px 12px; border-radius: 6px; cursor: pointer; transition: 0.2s;">Save Image (.jp2)</button>
                                        </div>
                                    </div>
                                `;
                                resultsContainer.insertAdjacentHTML('beforeend', photoCard);
                            }
                            
                            resultsContainer.insertAdjacentHTML('beforeend', renderCard("Digital Signature", `<span style="font-size: 0.85rem; opacity: 0.8; color: #38bdf8;">[ 2048-bit Signature Parsed ]</span>`));
                        }
                        
                        hasData = true;
                    } else {
                        showError("Decompressed data did not match expected Aadhaar structure.");
                        return;
                    }
                } catch (e) {
                     console.error("Inflation error:", e);
                     showError("Failed to decompress Secure QR Code. It might be corrupt. Error: " + e.message);
                     return;
                }
            } else {
                // Try old XML format parsing
                try {
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(result.barcodeText, "text/xml");
                    
                    const parseError = xmlDoc.getElementsByTagName("parsererror");
                    if (parseError.length > 0) {
                        throw new Error("XML Parsing Error");
                    }
                    
                    const rootNode = xmlDoc.documentElement;
                    if (rootNode && rootNode.attributes) {
                        for (let i = 0; i < rootNode.attributes.length; i++) {
                            let attrib = rootNode.attributes[i];
                            var name = attrib.name.toLowerCase();
                            var value = attrib.value;
                            var displayLabel = labelMap[name] || name.toUpperCase();
                            
                            var cardHtml = `
                                <div class="result-card">
                                    <div class="result-label">${displayLabel}</div>
                                    <div class="result-value">${value}</div>
                                </div>
                            `;
                            resultsContainer.insertAdjacentHTML('beforeend', cardHtml);
                            hasData = true;
                        }
                    }
                } catch (error) {
                    showError(`Not a valid Aadhaar format. QR Code Text:<br><br><strong style="word-break: break-all;">${result.barcodeText}</strong>`);
                    return;
                }
            }

            if (hasData) {
                resultsContainer.classList.remove('hidden');
            } else {
                 showError(`QR Code was read successfully, but it doesn't contain valid Aadhaar data.<br><br><strong style="word-break: break-all;">Extracted Value:</strong> ${result.barcodeText}`);
            }
        }
    } catch (e) {
        loader.classList.add('hidden');
        showError('An error occurred during decoding: ' + e.message);
    }
}

function showError(msg) {
    errorContainer.innerHTML = msg;
    errorContainer.classList.remove('hidden');
}

window.downloadImageJpg = function() {
    if (!window.currentAadhaarImageJpg) return;
    let a = document.createElement('a');
    a.style.display = 'none';
    a.href = window.currentAadhaarImageJpg;
    a.download = "aadhaar_photograph.jpg";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
    }, 100);
};

window.downloadImage = function() {
    if (!window.currentAadhaarImageBytes) return;
    
    // Create a Blob from the JPEG2000 Uint8Array bytes
    let blob = new Blob([window.currentAadhaarImageBytes], { type: 'image/jp2' });
    let url = URL.createObjectURL(blob);
    
    let a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = "aadhaar_photo.jp2";
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
};
