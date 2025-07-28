// Font-Manager 확장 - 폰트 관리
import { extension_settings, getContext, loadExtensionSettings, renderExtensionTemplateAsync } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { SlashCommand } from "../../../slash-commands/SlashCommand.js";
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";
import { ARGUMENT_TYPE, SlashCommandNamedArgument } from "../../../slash-commands/SlashCommandArgument.js";
import { POPUP_RESULT, POPUP_TYPE, Popup } from "../../../popup.js";

// 확장 설정
const extensionName = "Font-Manager";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {
    fonts: [],
    presets: [],
    currentPreset: null
};

// 현재 선택된 프리셋 ID와 임시 UI 폰트
let selectedPresetId = null;
let tempUiFont = null;
let originalUIStyles = null;

// 설정 로드
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
}

// 고유 ID 생성
function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ArrayBuffer를 Base64로 변환 (스택 오버플로우 방지)
function arrayBufferToBase64(buffer) {
    try {
        const bytes = new Uint8Array(buffer);
        const chunkSize = 8192; // 8KB 청크로 더 안전하게 처리
        let binaryString = '';
        
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.slice(i, i + chunkSize);
            const chunkString = Array.from(chunk, byte => String.fromCharCode(byte)).join('');
            binaryString += chunkString;
        }
        
        return btoa(binaryString);
    } catch (error) {
        console.error('Base64 인코딩 실패:', error);
        throw new Error('폰트 파일 인코딩에 실패했습니다.');
    }
}

// 프리셋 이름 설정 팝업 표시
async function showPresetNamePopup(existingName = '') {
    let success = false;
    
    while (!success) {
        const presetNameHtml = `
            <div class="font-name-popup-content">
                <p>프리셋 이름을 설정하세요.</p>
                <input type="text" id="preset-name-input" class="font-name-input" placeholder="프리셋 이름을 입력하세요" maxlength="50" value="${existingName}">
            </div>
        `;
        
        const template = $(presetNameHtml);
        const popup = new Popup(template, POPUP_TYPE.CONFIRM, '프리셋 이름 설정', { 
            okButton: '저장', 
            cancelButton: '취소'
        });
        
        const result = await popup.show();
        
        if (!result) {
            return null;
        }
        
        const presetName = template.find('#preset-name-input').val().trim();
        
        // 프리셋 이름 유효성 검사
        if (!presetName) {
            alert('프리셋 이름을 입력해주세요.');
            continue;
        }
        
        // 중복 검사 (기존 프리셋 수정이 아닌 경우)
        if (!existingName) {
            const presets = extension_settings[extensionName]?.presets || [];
            const existingPresets = presets.map(p => p.name);
            if (existingPresets.includes(presetName)) {
                alert('이미 존재하는 프리셋 이름입니다.\n다른 이름을 사용해주세요.');
                continue;
            }
        }
        
        return presetName;
    }
}

// 폰트 이름 설정 팝업 표시
async function showFontNamePopup(fontData) {
    let success = false;
    
    while (!success) {
        const fontNameHtml = `
            <div class="font-name-popup-content">
                <p>폰트 이름을 설정하세요.</p>
                <input type="text" id="font-name-input" class="font-name-input" placeholder="폰트 이름을 입력하세요" maxlength="50">
            </div>
        `;
        
        const template = $(fontNameHtml);
        const popup = new Popup(template, POPUP_TYPE.CONFIRM, '폰트 이름 설정', { 
            okButton: '저장', 
            cancelButton: '취소'
        });
        
        const result = await popup.show();
        
        if (!result) {
            return false;
        }
        
        const fontName = template.find('#font-name-input').val().trim();
        
        // 폰트 이름 유효성 검사
        if (!fontName) {
            alert('폰트 이름을 입력해주세요.');
            continue;
        }
        
        // 중복 검사
        const fonts = extension_settings[extensionName]?.fonts || [];
        const existingFonts = fonts.map(f => f.name);
        if (existingFonts.includes(fontName)) {
            alert('이미 존재하는 폰트 이름입니다.\n다른 이름을 사용해주세요.');
            continue;
        }
        
        // 새 폰트 생성
        const newFont = {
            id: generateId(),
            name: fontName,
            type: fontData.type, // 'source' 또는 'file'
            data: fontData.data,
            filename: fontData.filename || null
        };
        
        // 설정이 존재하는지 확인하고 폰트 추가
        if (!extension_settings[extensionName]) {
            extension_settings[extensionName] = defaultSettings;
        }
        if (!extension_settings[extensionName].fonts) {
            extension_settings[extensionName].fonts = [];
        }
        extension_settings[extensionName].fonts.push(newFont);
        
        // 시스템에 즉시 적용
        applyFontToSystem(newFont);
        
        saveSettingsDebounced();
        success = true;
    }
    
    return true;
}

// 폰트 관리 창 열기
async function openFontManagementPopup() {
    const template = $(await renderExtensionTemplateAsync(`third-party/${extensionName}`, 'template'));
    
    // 첫 번째 프리셋을 기본 선택
    const presets = extension_settings[extensionName]?.presets || [];
    if (presets.length > 0 && !selectedPresetId) {
        selectedPresetId = presets[0].id;
    }
    
    // 원본 UI 스타일 저장
    saveOriginalUIStyles();
    
    // 모든 영역 렌더링
    renderPresetDropdown(template);
    renderUIFontSection(template);
    renderFontAddArea(template);
    renderFontList(template);
    
    // 이벤트 리스너 추가
    setupEventListeners(template);
    
    const popup = new Popup(template, POPUP_TYPE.CONFIRM, '폰트 관리', { 
        wide: true, 
        large: true,
        okButton: '저장', 
        cancelButton: '취소'
    });
    
    const result = await popup.show();
    
    if (result) {
        console.log("폰트 설정이 저장되었습니다.");
    } else {
        // 취소 시 원본 스타일 복원
        restoreOriginalUIStyles();
    }
    
    // 임시 변수 초기화
    tempUiFont = null;
}

// 프리셋 드롭다운 렌더링
function renderPresetDropdown(template) {
    const presets = extension_settings[extensionName]?.presets || [];
    const dropdown = template.find('#preset-dropdown');
    
    dropdown.empty();
    
    if (presets.length === 0) {
        dropdown.append('<option value="">프리셋이 없습니다</option>');
        dropdown.prop('disabled', true);
    } else {
        dropdown.prop('disabled', false);
        presets.forEach(preset => {
            const isSelected = preset.id === selectedPresetId;
            dropdown.append(`<option value="${preset.id}" ${isSelected ? 'selected' : ''}>${preset.name}</option>`);
        });
    }
}

// UI 폰트 섹션 렌더링
function renderUIFontSection(template) {
    const fonts = extension_settings[extensionName]?.fonts || [];
    const dropdown = template.find('#ui-font-dropdown');
    
    dropdown.empty();
    dropdown.append('<option value="">기본 폰트</option>');
    
    fonts.forEach(font => {
        const isSelected = tempUiFont === font.name;
        dropdown.append(`<option value="${font.name}" ${isSelected ? 'selected' : ''}>${font.name}</option>`);
    });
    
    // 현재 프리셋의 UI 폰트 설정
    if (selectedPresetId && !tempUiFont) {
        const presets = extension_settings[extensionName]?.presets || [];
        const currentPreset = presets.find(p => p.id === selectedPresetId);
        if (currentPreset && currentPreset.uiFont) {
            dropdown.val(currentPreset.uiFont);
        }
    }
}

// 폰트 추가 영역 렌더링
function renderFontAddArea(template) {
    const addAreaHtml = `
        <div class="font-add-section">
            <h3>소스코드로 폰트 가져오기</h3>
            <textarea id="font-source-textarea" class="font-source-textarea" placeholder="여기에 폰트의 소스코드를 넣으세요&#10;&#10;예시:&#10;@font-face {&#10;  font-family: 'MyCustomFont';&#10;  src: url('https://example.com/font.woff2') format('woff2');&#10;}"></textarea>
            <button id="import-font-btn" class="import-font-btn">가져오기</button>
        </div>
        
        <div class="font-add-section">
            <h3>로컬 폰트 파일 불러오기</h3>
            <input type="file" id="font-file-input" class="font-file-input" accept=".ttf,.otf,.woff,.woff2">
            <button id="select-font-file-btn" class="select-font-file-btn">폰트 파일 선택 (TTF, OTF, WOFF, WOFF2)</button>
        </div>
    `;
    
    template.find('#font-add-area').html(addAreaHtml);
}

// 폰트 리스트 렌더링
function renderFontList(template) {
    const fonts = extension_settings[extensionName]?.fonts || [];
    const listArea = template.find('#font-list-area');
    
    let listHtml = '<h3 class="font-list-title">불러온 폰트 목록</h3>';
    
    if (fonts.length === 0) {
        listHtml += `
            <div class="no-fonts-message">
                <h4>등록된 폰트가 없습니다</h4>
                <p>위의 방법을 사용하여 폰트를 추가해보세요.</p>
            </div>
        `;
    } else {
        fonts.forEach(font => {
            listHtml += `
                <div class="font-item">
                    <span class="font-name">${font.name}</span>
                    <span class="font-preview" style="font-family: '${font.name}', sans-serif;">Aa</span>
                    <button class="remove-font-btn" data-id="${font.id}" title="폰트 삭제">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
        });
    }
    
    listArea.html(listHtml);
}

// 원본 UI 스타일 저장
function saveOriginalUIStyles() {
    const existingStyle = document.getElementById('temp-ui-font-style');
    if (existingStyle) {
        existingStyle.remove();
    }
    
    // 원본 스타일 정보 저장 (필요 시)
    originalUIStyles = {
        // 나중에 필요하면 원본 스타일 정보 저장
    };
}

// 원본 UI 스타일 복원
function restoreOriginalUIStyles() {
    const tempStyle = document.getElementById('temp-ui-font-style');
    if (tempStyle) {
        tempStyle.remove();
    }
}

// UI 폰트 임시 적용
async function applyTempUIFont(fontName) {
    const existingStyle = document.getElementById('temp-ui-font-style');
    if (existingStyle) {
        existingStyle.remove();
    }
    
    if (!fontName) {
        tempUiFont = null;
        return;
    }
    
    // 폰트 로딩 체크 (브라우저 지원 여부 확인)
    if (document.fonts && document.fonts.check) {
        try {
            // 폰트가 로드될 때까지 기다리기
            await document.fonts.load(`16px "${fontName}"`);
            
            // 폰트가 사용 가능한지 확인
            const isLoaded = document.fonts.check(`16px "${fontName}"`);
            if (!isLoaded) {
                console.warn(`폰트 '${fontName}'가 로드되지 않았지만 적용을 시도합니다.`);
            }
        } catch (error) {
            console.warn(`폰트 '${fontName}' 로딩 체크 실패:`, error);
        }
    }
    
    const cssRules = `
        html body,
        html body *,
        html body input,
        html body select,
        html body span,
        html body code,
        html body .list-group-item,
        html body .ui-widget-content .ui-menu-item-wrapper,
        html body textarea:not(#send_textarea),
        html body div,
        html body p,
        html body label,
        html body button {
            font-family: '${fontName}', var(--ui-default-font), Sans-Serif !important;
            font-weight: normal !important;
            line-height: 1.1rem !important;
            -webkit-text-stroke: var(--ui-font-weight) !important;
        }
        html body *::before,
        html body i:not(.fa-solid):not(.fa-brands):not(.fa-regular) {
            font-family: '${fontName}', Sans-Serif !important;
            filter: none !important;
            text-shadow: none !important;
        }
        html body .drawer-content,
        html body textarea,
        html body .drawer-icon {
            border: 0 !important;
            color: var(--default-font-color) !important;
        }
        html body .interactable,
        html body .fa-solid {
            transition: all 0.3s !important;
        }
    `;
    
    const style = document.createElement('style');
    style.id = 'temp-ui-font-style';
    style.textContent = cssRules;
    document.head.appendChild(style);
    
    tempUiFont = fontName;
    console.log(`임시 UI 폰트 '${fontName}' 적용됨`);
}

// 이벤트 리스너 설정
function setupEventListeners(template) {
    // 프리셋 드롭다운 변경 이벤트
    template.find('#preset-dropdown').off('change').on('change', function() {
        const presetId = $(this).val();
        if (presetId) {
            selectedPresetId = presetId;
            renderUIFontSection(template);
            setupEventListeners(template);
        }
    });
    
    // 프리셋 저장 버튼
    template.find('#save-preset-btn').off('click').on('click', function() {
        if (selectedPresetId) {
            saveCurrentPreset();
            alert('프리셋이 저장되었습니다.');
        } else {
            alert('저장할 프리셋을 선택해주세요.');
        }
    });
    
    // 프리셋 이름 수정 버튼
    template.find('#edit-preset-btn').off('click').on('click', async function() {
        if (!selectedPresetId) {
            alert('수정할 프리셋을 선택해주세요.');
            return;
        }
        
                 const presets = extension_settings[extensionName]?.presets || [];
         const currentPreset = presets.find(p => p.id === selectedPresetId);
        const newName = await showPresetNamePopup(currentPreset.name);
        
        if (newName) {
            currentPreset.name = newName;
            saveSettingsDebounced();
            renderPresetDropdown(template);
            setupEventListeners(template);
        }
    });
    
    // 프리셋 삭제 버튼
    template.find('#delete-preset-btn').off('click').on('click', function() {
        if (selectedPresetId && confirm('선택된 프리셋을 삭제하시겠습니까?')) {
            deletePreset(template, selectedPresetId);
        }
    });
    
    // 프리셋 추가 버튼
    template.find('#add-preset-btn').off('click').on('click', async function() {
        const presetName = await showPresetNamePopup();
        if (presetName) {
            const newPreset = {
                id: generateId(),
                name: presetName,
                uiFont: null
            };
            
            // 설정이 존재하는지 확인하고 프리셋 추가
            if (!extension_settings[extensionName]) {
                extension_settings[extensionName] = defaultSettings;
            }
            if (!extension_settings[extensionName].presets) {
                extension_settings[extensionName].presets = [];
            }
            extension_settings[extensionName].presets.push(newPreset);
            selectedPresetId = newPreset.id;
            saveSettingsDebounced();
            
            renderPresetDropdown(template);
            renderUIFontSection(template);
            setupEventListeners(template);
        }
    });
    
    // UI 폰트 드롭다운 변경 이벤트
    template.find('#ui-font-dropdown').off('change').on('change', async function() {
        const fontName = $(this).val();
        if (fontName) {
            // 폰트가 실제로 로드되었는지 확인
            const fonts = extension_settings[extensionName]?.fonts || [];
            const selectedFont = fonts.find(f => f.name === fontName);
            if (selectedFont) {
                // 폰트가 로드될 때까지 잠시 기다린 후 적용
                setTimeout(async () => {
                    await applyTempUIFont(fontName);
                }, 200);
            } else {
                await applyTempUIFont(fontName);
            }
        } else {
            await applyTempUIFont(null);
        }
    });
    
    // 소스코드 가져오기 버튼
    template.find('#import-font-btn').off('click').on('click', async function() {
        const sourceCode = template.find('#font-source-textarea').val().trim();
        if (!sourceCode) {
            alert('폰트 소스코드를 입력해주세요.');
            return;
        }
        
        const success = await showFontNamePopup({
            type: 'source',
            data: sourceCode
        });
        
        if (success) {
            template.find('#font-source-textarea').val('');
            renderUIFontSection(template);
            renderFontList(template);
            setupEventListeners(template);
        }
    });
    
    // 폰트 파일 선택 버튼
    template.find('#select-font-file-btn').off('click').on('click', function() {
        template.find('#font-file-input').click();
    });
    
    // 폰트 파일 선택 이벤트
    template.find('#font-file-input').off('change').on('change', async function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const validExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
        const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        
        if (!validExtensions.includes(fileExtension)) {
            alert('지원되는 폰트 파일 형식: TTF, OTF, WOFF, WOFF2');
            return;
        }
        
        // 파일 크기 체크 (10MB 제한)
        if (file.size > 10 * 1024 * 1024) {
            alert('폰트 파일 크기가 너무 큽니다. (최대 10MB)');
            return;
        }
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            // 큰 파일의 스택 오버플로우 방지를 위한 청크 방식 base64 변환
            const base64 = arrayBufferToBase64(arrayBuffer);
            
            const success = await showFontNamePopup({
                type: 'file',
                data: base64,
                filename: file.name
            });
            
            if (success) {
                $(this).val('');
                renderUIFontSection(template);
                renderFontList(template);
                setupEventListeners(template);
            }
        } catch (error) {
            console.error('폰트 파일 로드 오류:', error);
            alert('폰트 파일을 읽는 중 오류가 발생했습니다.');
        }
    });
    
    // 폰트 삭제 버튼 이벤트
    template.find('.remove-font-btn').off('click').on('click', function() {
        const fontId = $(this).data('id');
        if (confirm('이 폰트를 삭제하시겠습니까?')) {
            deleteFont(template, fontId);
        }
    });
}

// 현재 프리셋 저장
function saveCurrentPreset() {
    if (!selectedPresetId) return;
    
    const presets = extension_settings[extensionName]?.presets || [];
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset) {
        preset.uiFont = tempUiFont;
        saveSettingsDebounced();
        
        // 임시 스타일을 영구 스타일로 변환
        const tempStyle = document.getElementById('temp-ui-font-style');
        if (tempStyle) {
            tempStyle.remove();
        }
        
        if (tempUiFont) {
            applyPresetUIFont(preset);
        }
    }
}

// 프리셋 삭제
function deletePreset(template, presetId) {
    if (!extension_settings[extensionName]?.presets) return;
    
    const presets = extension_settings[extensionName].presets;
    const presetIndex = presets.findIndex(p => p.id === presetId);
    
    if (presetIndex !== -1) {
        presets.splice(presetIndex, 1);
        
        // 선택된 프리셋 조정
        if (presets.length > 0) {
            selectedPresetId = presets[0].id;
        } else {
            selectedPresetId = null;
        }
        
        // UI 업데이트
        renderPresetDropdown(template);
        renderUIFontSection(template);
        setupEventListeners(template);
        
        saveSettingsDebounced();
    }
}

// 폰트 삭제
function deleteFont(template, fontId) {
    if (!extension_settings[extensionName]?.fonts) return;
    
    const fonts = extension_settings[extensionName].fonts;
    const fontIndex = fonts.findIndex(f => f.id === fontId);
    
    if (fontIndex !== -1) {
        // 시스템에서 제거
        removeFontFromSystem(fonts[fontIndex]);
        
        // 배열에서 제거
        fonts.splice(fontIndex, 1);
        
        // UI 업데이트
        renderUIFontSection(template);
        renderFontList(template);
        setupEventListeners(template);
        
        saveSettingsDebounced();
    }
}

// 폰트를 시스템에 적용
function applyFontToSystem(font) {
    try {
        if (font.type === 'source') {
            // 기존 스타일 제거
            const existingStyle = document.getElementById(`custom-font-${font.id}`);
            if (existingStyle) {
                existingStyle.remove();
            }
            
            // CSS 소스코드에서 폰트 적용
            const style = document.createElement('style');
            style.textContent = font.data;
            style.id = `custom-font-${font.id}`;
            document.head.appendChild(style);
            
            // 폰트가 로드될 때까지 기다리기
            setTimeout(() => {
                console.log(`소스코드 폰트 '${font.name}'이 적용되었습니다.`);
            }, 100);
            
        } else if (font.type === 'file') {
            // TTF 파일에서 폰트 적용 - 더 안전한 방식
            const formats = [
                { mime: 'font/truetype', format: 'truetype' },
                { mime: 'font/opentype', format: 'opentype' },
                { mime: 'font/woff2', format: 'woff2' },
                { mime: 'font/woff', format: 'woff' }
            ];
            
            let formatIndex = 0;
            
            const tryNextFormat = () => {
                if (formatIndex >= formats.length) {
                    console.error(`폰트 '${font.name}' 로드 실패: 지원되는 폰트 포맷을 찾을 수 없습니다.`);
                    alert(`폰트 '${font.name}' 로드에 실패했습니다.\n파일이 유효한 폰트 파일인지 확인해주세요.`);
                    return;
                }
                
                const formatInfo = formats[formatIndex];
                const fontData = `data:${formatInfo.mime};base64,${font.data}`;
                
                try {
                    const fontFace = new FontFace(font.name, `url(${fontData})`, {
                        style: 'normal',
                        weight: 'normal'
                    });
                    
                    fontFace.load().then(() => {
                        document.fonts.add(fontFace);
                        console.log(`${formatInfo.format} 폰트 '${font.name}'이 로드되었습니다.`);
                    }).catch(formatError => {
                        console.warn(`${formatInfo.format} 포맷으로 로드 실패:`, formatError.message);
                        formatIndex++;
                        tryNextFormat();
                    });
                } catch (error) {
                    console.warn(`포맷 ${formatInfo.format} 시도 중 오류:`, error);
                    formatIndex++;
                    tryNextFormat();
                }
            };
            
            tryNextFormat();
        }
        
    } catch (error) {
        console.error(`폰트 '${font.name}' 적용 실패:`, error);
        alert(`폰트 적용 중 오류가 발생했습니다: ${error.message}`);
    }
}

// 프리셋 UI 폰트 적용
function applyPresetUIFont(preset) {
    if (!preset.uiFont) return;
    
    const existingStyle = document.getElementById('preset-ui-font-style');
    if (existingStyle) {
        existingStyle.remove();
    }
    
    const cssRules = `
        html body,
        html body *,
        html body input,
        html body select,
        html body span,
        html body code,
        html body .list-group-item,
        html body .ui-widget-content .ui-menu-item-wrapper,
        html body textarea:not(#send_textarea),
        html body div,
        html body p,
        html body label,
        html body button {
            font-family: '${preset.uiFont}', var(--ui-default-font), Sans-Serif !important;
            font-weight: normal !important;
            line-height: 1.1rem !important;
            -webkit-text-stroke: var(--ui-font-weight) !important;
        }
        html body *::before,
        html body i:not(.fa-solid):not(.fa-brands):not(.fa-regular) {
            font-family: '${preset.uiFont}', Sans-Serif !important;
            filter: none !important;
            text-shadow: none !important;
        }
        html body .drawer-content,
        html body textarea,
        html body .drawer-icon {
            border: 0 !important;
            color: var(--default-font-color) !important;
        }
        html body .interactable,
        html body .fa-solid {
            transition: all 0.3s !important;
        }
    `;
    
    const style = document.createElement('style');
    style.id = 'preset-ui-font-style';
    style.textContent = cssRules;
    document.head.appendChild(style);
}

// 시스템에서 폰트 제거
function removeFontFromSystem(font) {
    try {
        if (font.type === 'source') {
            // CSS 스타일 제거
            const styleElement = document.getElementById(`custom-font-${font.id}`);
            if (styleElement) {
                styleElement.remove();
            }
        } else if (font.type === 'file') {
            // FontFace 제거 시도
            document.fonts.forEach(fontFace => {
                if (fontFace.family === font.name) {
                    document.fonts.delete(fontFace);
                }
            });
        }
        
        console.log(`폰트 '${font.name}'이 시스템에서 제거되었습니다.`);
    } catch (error) {
        console.error(`폰트 '${font.name}' 제거 실패:`, error);
    }
}

// 모든 폰트 업데이트 (초기 로드용)
function updateAllFonts() {
    const fonts = extension_settings[extensionName]?.fonts || [];
    
    // 각 폰트를 시스템에 적용
    fonts.forEach(font => {
        applyFontToSystem(font);
    });
    
    // 현재 프리셋의 UI 폰트 적용
    const currentPreset = extension_settings[extensionName]?.currentPreset;
    if (currentPreset) {
        const presets = extension_settings[extensionName]?.presets || [];
        const preset = presets.find(p => p.id === currentPreset);
        if (preset) {
            applyPresetUIFont(preset);
        }
    }
}

// 슬래시 커맨드 등록
function registerSlashCommands() {
    try {
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'font',
            callback: async (parsedArgs) => {
                openFontManagementPopup();
                return '';
            },
            helpString: '폰트 관리 창을 엽니다.\n사용법: /font',
            namedArgumentList: [],
            returns: '폰트 관리 창 열기',
        }));
        
        console.log("폰트 관리 슬래시 커맨드가 등록되었습니다: /font");
    } catch (error) {
        console.error("슬래시 커맨드 등록 실패:", error);
        // 실패 시 5초 후 재시도
        setTimeout(registerSlashCommands, 5000);
    }
}

// 요술봉메뉴에 버튼 추가
async function addToWandMenu() {
    try {
        const buttonHtml = await $.get(`${extensionFolderPath}/button.html`);
        
        const extensionsMenu = $("#extensionsMenu");
        if (extensionsMenu.length > 0) {
            extensionsMenu.append(buttonHtml);
            $("#font_manager_button").on("click", openFontManagementPopup);
        } else {
            setTimeout(addToWandMenu, 1000);
        }
    } catch (error) {
        console.error("button.html 로드 실패:", error);
    }
}

// 확장 초기화
jQuery(async () => {
    await loadSettings();
    await addToWandMenu();
    updateAllFonts();
    
    // SillyTavern 로드 완료 후 슬래시 커맨드 등록
    setTimeout(registerSlashCommands, 2000);
    
    console.log("Font-Manager 확장이 로드되었습니다.");
}); 