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
    fonts: []
};

// 현재 선택된 폰트 ID
let selectedFontId = null;

// 설정 로드
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
}

// 고유 ID 생성
function generateId() {
    return 'font_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
        const existingFonts = extension_settings[extensionName].fonts.map(f => f.name);
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
        
        extension_settings[extensionName].fonts.push(newFont);
        
        // 시스템에 즉시 적용
        applyFontToSystem(newFont);
        
        saveSettingsDebounced();
        success = true;
        
        // 새로 생성된 폰트를 선택
        selectedFontId = newFont.id;
    }
    
    return true;
}

// 폰트 관리 창 열기
async function openFontManagementPopup() {
    const template = $(await renderExtensionTemplateAsync(`third-party/${extensionName}`, 'template'));
    
    // 첫 번째 폰트를 기본 선택
    const fonts = extension_settings[extensionName].fonts || [];
    if (fonts.length > 0 && !selectedFontId) {
        selectedFontId = fonts[0].id;
    }
    
    // 드롭다운과 폰트 추가 영역, 리스트 렌더링
    renderDropdown(template);
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
    }
}

// 드롭다운 옵션 렌더링
function renderDropdown(template) {
    const fonts = extension_settings[extensionName].fonts || [];
    const dropdown = template.find('#font-dropdown');
    
    dropdown.empty();
    
    if (fonts.length === 0) {
        dropdown.append('<option value="">폰트가 없습니다</option>');
        dropdown.prop('disabled', true);
    } else {
        dropdown.prop('disabled', false);
        fonts.forEach(font => {
            const isSelected = font.id === selectedFontId;
            dropdown.append(`<option value="${font.id}" ${isSelected ? 'selected' : ''}>${font.name}</option>`);
        });
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
            <input type="file" id="font-file-input" class="font-file-input" accept=".ttf">
            <button id="select-font-file-btn" class="select-font-file-btn">폰트 선택 (TTF 파일만)</button>
        </div>
    `;
    
    template.find('#font-add-area').html(addAreaHtml);
}

// 폰트 리스트 렌더링
function renderFontList(template) {
    const fonts = extension_settings[extensionName].fonts || [];
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

// 폰트 선택
function selectFont(template, fontId) {
    selectedFontId = fontId;
    renderDropdown(template);
    setupEventListeners(template);
}

// 이벤트 리스너 설정
function setupEventListeners(template) {
    // 드롭다운 변경 이벤트
    template.find('#font-dropdown').off('change').on('change', function() {
        const fontId = $(this).val();
        if (fontId) {
            selectFont(template, fontId);
        }
    });
    
    // + 버튼 클릭 이벤트 (폰트 추가 영역 토글)
    template.find('#add-font-btn').off('click').on('click', function() {
        const addArea = template.find('#font-add-area');
        addArea.toggle();
    });
    
    // 삭제 버튼 클릭 이벤트
    template.find('#delete-font-btn').off('click').on('click', function() {
        if (selectedFontId && confirm('선택된 폰트를 삭제하시겠습니까?')) {
            deleteFont(template, selectedFontId);
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
            renderDropdown(template);
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
        
        if (!file.name.toLowerCase().endsWith('.ttf')) {
            alert('TTF 파일만 선택할 수 있습니다.');
            return;
        }
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            
            const success = await showFontNamePopup({
                type: 'file',
                data: base64,
                filename: file.name
            });
            
            if (success) {
                // 파일 입력 초기화
                $(this).val('');
                renderDropdown(template);
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

// 폰트 삭제
function deleteFont(template, fontId) {
    const fonts = extension_settings[extensionName].fonts;
    const fontIndex = fonts.findIndex(f => f.id === fontId);
    
    if (fontIndex !== -1) {
        // 시스템에서 제거
        removeFontFromSystem(fonts[fontIndex]);
        
        // 배열에서 제거
        fonts.splice(fontIndex, 1);
        
        // 선택된 폰트 조정
        if (fonts.length > 0) {
            selectedFontId = fonts[0].id;
        } else {
            selectedFontId = null;
        }
        
        // UI 업데이트
        renderDropdown(template);
        renderFontList(template);
        setupEventListeners(template);
        
        saveSettingsDebounced();
    }
}

// 폰트를 시스템에 적용
function applyFontToSystem(font) {
    try {
        let fontFace;
        
        if (font.type === 'source') {
            // CSS 소스코드에서 폰트 적용
            const style = document.createElement('style');
            style.textContent = font.data;
            style.id = `custom-font-${font.id}`;
            document.head.appendChild(style);
        } else if (font.type === 'file') {
            // TTF 파일에서 폰트 적용
            const fontData = `data:font/truetype;base64,${font.data}`;
            fontFace = new FontFace(font.name, `url(${fontData})`);
            
            fontFace.load().then(() => {
                document.fonts.add(fontFace);
                console.log(`폰트 '${font.name}'이 로드되었습니다.`);
            }).catch(error => {
                console.error(`폰트 '${font.name}' 로드 실패:`, error);
            });
        }
        
        console.log(`폰트 '${font.name}'이 시스템에 적용되었습니다.`);
    } catch (error) {
        console.error(`폰트 '${font.name}' 적용 실패:`, error);
    }
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
    const fonts = extension_settings[extensionName].fonts || [];
    
    // 각 폰트를 시스템에 적용
    fonts.forEach(font => {
        applyFontToSystem(font);
    });
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