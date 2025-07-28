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
const defaultSettings = {
    fonts: [],
    presets: [],
    currentPreset: null,
    // UI 폰트 조절 값들
    uiFontSize: 14,
    uiFontWeight: 0,
    // 채팅 폰트 조절 값들
    chatFontSize: 14,
    inputFontSize: 14,
    chatFontWeight: 0,
    chatLineHeight: 1.2,
    // 테마 연동 규칙들
    themeRules: []
};

// 현재 선택된 프리셋 ID와 임시 폰트들
let selectedPresetId = null;
let tempUiFont = null;
let tempMessageFont = null;
let originalUIStyles = null;
let fontStyle = null;
let settings = null;
// 임시 조절값들
let tempUiFontSize = null;
let tempUiFontWeight = null;
let tempChatFontSize = null;
let tempInputFontSize = null;
let tempChatFontWeight = null;
let tempChatLineHeight = null;

// 설정 초기화
function initSettings() {
    settings = extension_settings[extensionName] ?? {};
    extension_settings[extensionName] = settings;
    if (Object.keys(settings).length === 0) {
        Object.assign(settings, defaultSettings);
    }
    // 기본값 보장
    settings.fonts = settings.fonts ?? [];
    settings.presets = settings.presets ?? [];
    settings.currentPreset = settings.currentPreset ?? null;
    settings.themeRules = settings.themeRules ?? [];
    // 조절값 기본값 보장
    settings.uiFontSize = settings.uiFontSize ?? 14;
    settings.uiFontWeight = settings.uiFontWeight ?? 0;
    settings.chatFontSize = settings.chatFontSize ?? 14;
    settings.inputFontSize = settings.inputFontSize ?? 14;
    settings.chatFontWeight = settings.chatFontWeight ?? 0;
    settings.chatLineHeight = settings.chatLineHeight ?? 1.2;
}

// 고유 ID 생성
function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
            const presets = settings?.presets || [];
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
        const fonts = settings?.fonts || [];
        const existingFonts = fonts.map(f => f.name);
        if (existingFonts.includes(fontName)) {
            alert('이미 존재하는 폰트 이름입니다.\n다른 이름을 사용해주세요.');
            continue;
        }
        
        // CSS에서 실제 폰트 패밀리 이름 추출
        const actualFontFamily = extractFontFamilyFromCSS(fontData.data);
        
        // 새 폰트 생성
        const newFont = {
            id: generateId(),
            name: fontName,
            type: 'source',
            data: fontData.data,
            fontFamily: actualFontFamily || fontName // CSS에서 추출된 이름이 있으면 사용, 없으면 사용자 입력 이름
        };
        
        // 폰트 추가
        settings.fonts.push(newFont);
        
        // 폰트 CSS 업데이트
        updateUIFont();
        
        saveSettingsDebounced();
        success = true;
    }
    
    return true;
}

// 폰트 관리 창 열기
async function openFontManagementPopup() {
    const template = $(await renderExtensionTemplateAsync(`third-party/${extensionName}`, 'template'));
    
    // 저장된 현재 프리셋이 있으면 선택, 없으면 첫 번째 프리셋 선택
    const presets = settings?.presets || [];
    const currentPresetId = settings?.currentPreset;
    
    if (currentPresetId && presets.find(p => p.id === currentPresetId)) {
        selectedPresetId = currentPresetId;
    } else if (presets.length > 0 && !selectedPresetId) {
        selectedPresetId = presets[0].id;
    }
    
    // 원본 UI 스타일 저장
    saveOriginalUIStyles();
    
    // 현재 프리셋의 폰트와 조절값들 미리 적용
    if (selectedPresetId) {
        const currentPreset = presets.find(p => p.id === selectedPresetId);
        if (currentPreset && currentPreset.uiFont) {
            applyTempUIFont(currentPreset.uiFont);
        }
        if (currentPreset && currentPreset.messageFont) {
            applyTempMessageFont(currentPreset.messageFont);
        }
        
        // 조절값들도 미리 적용
        tempUiFontSize = currentPreset?.uiFontSize ?? settings.uiFontSize;
        tempUiFontWeight = currentPreset?.uiFontWeight ?? settings.uiFontWeight;
        tempChatFontSize = currentPreset?.chatFontSize ?? settings.chatFontSize;
        tempInputFontSize = currentPreset?.inputFontSize ?? settings.inputFontSize;
        tempChatFontWeight = currentPreset?.chatFontWeight ?? settings.chatFontWeight;
        tempChatLineHeight = currentPreset?.chatLineHeight ?? settings.chatLineHeight;
    }
    
    // 모든 영역 렌더링
    renderPresetDropdown(template);
    renderUIFontSection(template);
    renderMessageFontSection(template);
    renderThemeLinkingSection(template);
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
        // 저장 버튼을 눌렀을 때 - 현재 설정값들을 전역 설정에 저장
        saveCurrentSettingsToGlobal();
        console.log("폰트 설정이 저장되었습니다.");
    } else {
        // 취소 시 원본 스타일 복원
        restoreOriginalUIStyles();
        tempUiFont = null;
        tempMessageFont = null;
        tempUiFontSize = null;
        tempUiFontWeight = null;
        tempChatFontSize = null;
        tempInputFontSize = null;
        tempChatFontWeight = null;
        tempChatLineHeight = null;
    }
    
    // 임시 변수 초기화
    tempUiFont = null;
    tempUiFontSize = null;
    tempUiFontWeight = null;
    tempChatFontSize = null;
    tempInputFontSize = null;
    tempChatFontWeight = null;
    tempChatLineHeight = null;
}

// 프리셋 드롭다운 렌더링
function renderPresetDropdown(template) {
    const presets = settings?.presets || [];
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
    const fonts = settings?.fonts || [];
    const dropdown = template.find('#ui-font-dropdown');
    
    dropdown.empty();
    dropdown.append('<option value="">기본 폰트</option>');
    
    fonts.forEach(font => {
        const isSelected = tempUiFont === font.name;
        dropdown.append(`<option value="${font.name}" ${isSelected ? 'selected' : ''}>${font.name}</option>`);
    });
    
    // 현재 프리셋의 UI 폰트 설정
    if (selectedPresetId) {
        const presets = settings?.presets || [];
        const currentPreset = presets.find(p => p.id === selectedPresetId);
        if (currentPreset && currentPreset.uiFont) {
            dropdown.val(currentPreset.uiFont);
            // 임시 폰트도 현재 프리셋 값으로 설정
            if (!tempUiFont) {
                tempUiFont = currentPreset.uiFont;
            }
        } else {
            dropdown.val("");  // 기본 폰트
        }
        
        // 조절바 값들 설정
        const uiFontSize = tempUiFontSize ?? currentPreset?.uiFontSize ?? settings.uiFontSize;
        const uiFontWeight = tempUiFontWeight ?? currentPreset?.uiFontWeight ?? settings.uiFontWeight;
        
        template.find('#ui-font-size-slider').val(uiFontSize);
        template.find('#ui-font-size-value').text(uiFontSize + 'px');
        template.find('#ui-font-weight-slider').val(uiFontWeight);
        template.find('#ui-font-weight-value').text(uiFontWeight.toFixed(1) + 'px');
        
        // 임시 값 설정
        if (tempUiFontSize === null) {
            tempUiFontSize = uiFontSize;
        }
        if (tempUiFontWeight === null) {
            tempUiFontWeight = uiFontWeight;
        }
    } else {
        // 프리셋이 없을 때 기본값 설정
        const uiFontSize = tempUiFontSize ?? settings.uiFontSize;
        const uiFontWeight = tempUiFontWeight ?? settings.uiFontWeight;
        
        template.find('#ui-font-size-slider').val(uiFontSize);
        template.find('#ui-font-size-value').text(uiFontSize + 'px');
        template.find('#ui-font-weight-slider').val(uiFontWeight);
        template.find('#ui-font-weight-value').text(uiFontWeight.toFixed(1) + 'px');
    }
}

// 메시지 폰트 섹션 렌더링
function renderMessageFontSection(template) {
    const fonts = settings?.fonts || [];
    const dropdown = template.find('#message-font-dropdown');
    
    dropdown.empty();
    dropdown.append('<option value="">기본 폰트</option>');
    
    fonts.forEach(font => {
        const isSelected = tempMessageFont === font.name;
        dropdown.append(`<option value="${font.name}" ${isSelected ? 'selected' : ''}>${font.name}</option>`);
    });
    
    // 현재 프리셋의 메시지 폰트 설정
    if (selectedPresetId) {
        const presets = settings?.presets || [];
        const currentPreset = presets.find(p => p.id === selectedPresetId);
        if (currentPreset && currentPreset.messageFont) {
            dropdown.val(currentPreset.messageFont);
            // 임시 폰트도 현재 프리셋 값으로 설정
            if (!tempMessageFont) {
                tempMessageFont = currentPreset.messageFont;
            }
        } else {
            dropdown.val("");  // 기본 폰트
        }
        
        // 조절바 값들 설정
        const chatFontSize = tempChatFontSize ?? currentPreset?.chatFontSize ?? settings.chatFontSize;
        const inputFontSize = tempInputFontSize ?? currentPreset?.inputFontSize ?? settings.inputFontSize;
        const chatFontWeight = tempChatFontWeight ?? currentPreset?.chatFontWeight ?? settings.chatFontWeight;
        const chatLineHeight = tempChatLineHeight ?? currentPreset?.chatLineHeight ?? settings.chatLineHeight;
        
        template.find('#chat-font-size-slider').val(chatFontSize);
        template.find('#chat-font-size-value').text(chatFontSize + 'px');
        template.find('#input-font-size-slider').val(inputFontSize);
        template.find('#input-font-size-value').text(inputFontSize + 'px');
        template.find('#chat-font-weight-slider').val(chatFontWeight);
        template.find('#chat-font-weight-value').text(chatFontWeight.toFixed(1) + 'px');
        template.find('#chat-line-height-slider').val(chatLineHeight);
        template.find('#chat-line-height-value').text(chatLineHeight.toFixed(1) + 'rem');
        
        // 임시 값 설정
        if (tempChatFontSize === null) {
            tempChatFontSize = chatFontSize;
        }
        if (tempInputFontSize === null) {
            tempInputFontSize = inputFontSize;
        }
        if (tempChatFontWeight === null) {
            tempChatFontWeight = chatFontWeight;
        }
        if (tempChatLineHeight === null) {
            tempChatLineHeight = chatLineHeight;
        }
    } else {
        // 프리셋이 없을 때 기본값 설정
        const chatFontSize = tempChatFontSize ?? settings.chatFontSize;
        const inputFontSize = tempInputFontSize ?? settings.inputFontSize;
        const chatFontWeight = tempChatFontWeight ?? settings.chatFontWeight;
        const chatLineHeight = tempChatLineHeight ?? settings.chatLineHeight;
        
        template.find('#chat-font-size-slider').val(chatFontSize);
        template.find('#chat-font-size-value').text(chatFontSize + 'px');
        template.find('#input-font-size-slider').val(inputFontSize);
        template.find('#input-font-size-value').text(inputFontSize + 'px');
        template.find('#chat-font-weight-slider').val(chatFontWeight);
        template.find('#chat-font-weight-value').text(chatFontWeight.toFixed(1) + 'px');
        template.find('#chat-line-height-slider').val(chatLineHeight);
        template.find('#chat-line-height-value').text(chatLineHeight.toFixed(1) + 'rem');
    }
}

// 테마 연동 섹션 렌더링
function renderThemeLinkingSection(template) {
    const presets = settings?.presets || [];
    const themeRules = settings?.themeRules || [];
    
    // 프리셋 드롭다운 옵션 생성
    let presetOptions = '<option value="">프리셋 선택</option>';
    presets.forEach(preset => {
        presetOptions += `<option value="${preset.id}">${preset.name}</option>`;
    });
    
    // 테마 연동 폼
    template.find('#theme-preset-dropdown').html(presetOptions);
    
    // 테마 규칙 리스트 렌더링
    renderThemeRulesList(template);
}

// 테마 규칙 리스트 렌더링
function renderThemeRulesList(template) {
    const themeRules = settings?.themeRules || [];
    const listArea = template.find('#theme-rules-list');
    
    if (themeRules.length === 0) {
        listArea.html(`
            <div class="no-theme-rules-message">
                <p>연동된 테마가 없습니다</p>
            </div>
        `);
    } else {
        let rulesHtml = '';
        themeRules.forEach(rule => {
            const presets = settings?.presets || [];
            const preset = presets.find(p => p.id === rule.presetId);
            const presetName = preset ? preset.name : '(삭제된 프리셋)';
            
            rulesHtml += `
                <div class="theme-rule-item">
                    <div class="theme-rule-info">
                        <span class="theme-rule-theme">${rule.themeName}</span>
                        <span class="theme-rule-arrow">→</span>
                        <span class="theme-rule-preset">${presetName}</span>
                    </div>
                    <button class="remove-theme-rule-btn" data-id="${rule.id}" title="테마 연동 삭제">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
        });
        listArea.html(rulesHtml);
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
    `;
    
    template.find('#font-add-area').html(addAreaHtml);
}

// 폰트 리스트 렌더링
function renderFontList(template) {
    const fonts = settings?.fonts || [];
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
    // 현재 임시 폰트 상태 저장
    originalUIStyles = {
        tempUiFont: tempUiFont,
        tempMessageFont: tempMessageFont,
        tempUiFontSize: tempUiFontSize,
        tempUiFontWeight: tempUiFontWeight,
        tempChatFontSize: tempChatFontSize,
        tempInputFontSize: tempInputFontSize,
        tempChatFontWeight: tempChatFontWeight,
        tempChatLineHeight: tempChatLineHeight
    };
}

// 원본 UI 스타일 복원
function restoreOriginalUIStyles() {
    // 원본 상태로 복원
    if (originalUIStyles) {
        tempUiFont = originalUIStyles.tempUiFont;
        tempMessageFont = originalUIStyles.tempMessageFont;
        tempUiFontSize = originalUIStyles.tempUiFontSize;
        tempUiFontWeight = originalUIStyles.tempUiFontWeight;
        tempChatFontSize = originalUIStyles.tempChatFontSize;
        tempInputFontSize = originalUIStyles.tempInputFontSize;
        tempChatFontWeight = originalUIStyles.tempChatFontWeight;
        tempChatLineHeight = originalUIStyles.tempChatLineHeight;
    } else {
        tempUiFont = null;
        tempMessageFont = null;
        tempUiFontSize = null;
        tempUiFontWeight = null;
        tempChatFontSize = null;
        tempInputFontSize = null;
        tempChatFontWeight = null;
        tempChatLineHeight = null;
    }
    updateUIFont();
}

// CSS에서 font-family 이름 추출
function extractFontFamilyFromCSS(css) {
    try {
        // @font-face 규칙에서 font-family 값 추출
        const fontFaceMatch = css.match(/@font-face\s*{[^}]*font-family\s*:\s*['"]*([^'";]+)['"]*[^}]*}/i);
        if (fontFaceMatch && fontFaceMatch[1]) {
            const fontFamily = fontFaceMatch[1].trim();
            return fontFamily;
        }
    } catch (error) {
        console.warn('[Font-Manager] font-family 추출 실패:', error);
    }
    return null;
}

// CSS 검증 및 정리
const sanitize = (css) => {
    if (!css) return '';
    try {
        const style = document.createElement('style');
        style.innerHTML = css;
        document.head.append(style);
        const sheet = style.sheet;
        
        if (!sheet) {
            style.remove();
            return css;
        }
        
        const rules = Array.from(sheet.cssRules).map(it => (it.cssText) ?? '').join('\n');
        style.remove();
        return rules;
    } catch (error) {
        console.warn('[Font-Manager] CSS sanitization 실패:', error);
        return css; // 실패시 원본 반환
    }
};

// UI 폰트 업데이트
function updateUIFont() {
    if (!fontStyle) {
        fontStyle = document.createElement('style');
        fontStyle.id = 'font-manager--ui-fonts';
        document.head.appendChild(fontStyle);
    }
    
    const fontCss = [];
    const uiFontCss = [];
    const cssVariables = [];
    
    // CSS 변수 설정
    const uiFontSize = tempUiFontSize ?? getCurrentPresetUIFontSize() ?? settings.uiFontSize;
    const uiFontWeight = tempUiFontWeight ?? getCurrentPresetUIFontWeight() ?? settings.uiFontWeight;
    const chatFontSize = tempChatFontSize ?? getCurrentPresetChatFontSize() ?? settings.chatFontSize;
    const inputFontSize = tempInputFontSize ?? getCurrentPresetInputFontSize() ?? settings.inputFontSize;
    const chatFontWeight = tempChatFontWeight ?? getCurrentPresetChatFontWeight() ?? settings.chatFontWeight;
    const chatLineHeight = tempChatLineHeight ?? getCurrentPresetChatLineHeight() ?? settings.chatLineHeight;
    
    cssVariables.push(`
:root {
  --font-manager-ui-size: ${uiFontSize}px;
  --font-manager-ui-weight: ${uiFontWeight}px;
  --font-manager-chat-size: ${chatFontSize}px;
  --font-manager-input-size: ${inputFontSize}px;
  --font-manager-chat-weight: ${chatFontWeight}px;
  --font-manager-chat-line-height: ${chatLineHeight}rem;
}
    `);
    
    // 모든 폰트 CSS 적용
    const fonts = settings?.fonts || [];
    
    fonts.forEach(font => {
        if (font.type === 'source') {
            fontCss.push(`/* FONT: ${font.name} */\n${font.data}`);
        }
    });
    
    // 현재 UI 폰트 적용
    const currentFontName = tempUiFont || getCurrentPresetUIFont();
    
    // 실제 사용할 font-family 이름 찾기
    let actualFontFamily = currentFontName;
    if (currentFontName) {
        const selectedFont = fonts.find(font => font.name === currentFontName);
        if (selectedFont && selectedFont.fontFamily) {
            actualFontFamily = selectedFont.fontFamily;
        }
    }
    
    if (currentFontName && actualFontFamily) {
        uiFontCss.push(`
/* UI FONT APPLICATION - Font Manager Override */
html body,
html body input,
html body select,
html body span,
html body code,
html body .list-group-item,
html body .ui-widget-content .ui-menu-item-wrapper,
html body textarea:not(#send_textarea) {
  font-family: "${actualFontFamily}", Sans-Serif !important;
  font-size: var(--font-manager-ui-size) !important;
  font-weight: normal !important;
  line-height: 1.1rem !important;
  -webkit-text-stroke: var(--font-manager-ui-weight) !important;
}
        `);
    } else {
        // 폰트가 선택되지 않았어도 조절값은 적용
        uiFontCss.push(`
/* UI FONT SIZE/WEIGHT APPLICATION - Font Manager Override */
html body,
html body input,
html body select,
html body span,
html body code,
html body .list-group-item,
html body .ui-widget-content .ui-menu-item-wrapper,
html body textarea:not(#send_textarea) {
  font-size: var(--font-manager-ui-size) !important;
  -webkit-text-stroke: var(--font-manager-ui-weight) !important;
}
        `);
    }
    
    // 현재 메시지 폰트 적용
    const currentMessageFontName = tempMessageFont || getCurrentPresetMessageFont();
    
    // 실제 사용할 메시지 font-family 이름 찾기
    let actualMessageFontFamily = currentMessageFontName;
    if (currentMessageFontName) {
        const selectedMessageFont = fonts.find(font => font.name === currentMessageFontName);
        if (selectedMessageFont && selectedMessageFont.fontFamily) {
            actualMessageFontFamily = selectedMessageFont.fontFamily;
        }
    }
    
    if (currentMessageFontName && actualMessageFontFamily) {
        uiFontCss.push(`
/* MESSAGE FONT APPLICATION - Font Manager Override */
.mes * {
  font-family: "${actualMessageFontFamily}" !important;
  font-size: var(--font-manager-chat-size) !important;
  line-height: var(--font-manager-chat-line-height) !important;
  -webkit-text-stroke: var(--font-manager-chat-weight) !important;
}

#send_form textarea {
  font-family: "${actualMessageFontFamily}" !important;
  font-size: var(--font-manager-input-size) !important;
  -webkit-text-stroke: var(--font-manager-chat-weight) !important;
}
        `);
    } else {
        // 폰트가 선택되지 않았어도 조절값은 적용
        uiFontCss.push(`
/* MESSAGE FONT SIZE/WEIGHT APPLICATION - Font Manager Override */
.mes * {
  font-size: var(--font-manager-chat-size) !important;
  line-height: var(--font-manager-chat-line-height) !important;
  -webkit-text-stroke: var(--font-manager-chat-weight) !important;
}

#send_form textarea {
  font-size: var(--font-manager-input-size) !important;
  -webkit-text-stroke: var(--font-manager-chat-weight) !important;
}
        `);
    }
    
    const finalCss = [
        '/*',
        ' * === CSS VARIABLES ===',
        ' */',
        cssVariables.join('\n\n'),
        '\n\n',
        '/*',
        ' * === FONT DEFINITIONS ===',
        ' */',
        fontCss.join('\n\n'),
        '\n\n',
        '/*',
        ' * === UI FONT APPLICATION ===',
        ' */',
        uiFontCss.join('\n\n')
    ].join('\n');
    
    const sanitizedCss = sanitize(finalCss);
    fontStyle.innerHTML = sanitizedCss;
}

// 현재 프리셋의 UI 폰트 가져오기
function getCurrentPresetUIFont() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.uiFont || null;
    }
    return null;
}

// 현재 프리셋의 메시지 폰트 가져오기
function getCurrentPresetMessageFont() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.messageFont || null;
    }
    return null;
}

// 현재 프리셋의 UI 폰트 조절값들 가져오기
function getCurrentPresetUIFontSize() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.uiFontSize || null;
    }
    return null;
}

function getCurrentPresetUIFontWeight() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.uiFontWeight || null;
    }
    return null;
}

// 현재 프리셋의 채팅 폰트 조절값들 가져오기
function getCurrentPresetChatFontSize() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.chatFontSize || null;
    }
    return null;
}

function getCurrentPresetInputFontSize() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.inputFontSize || null;
    }
    return null;
}

function getCurrentPresetChatFontWeight() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.chatFontWeight || null;
    }
    return null;
}

function getCurrentPresetChatLineHeight() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.chatLineHeight || null;
    }
    return null;
}

// UI 폰트 임시 적용
function applyTempUIFont(fontName) {
    tempUiFont = fontName;
    updateUIFont();
}

// 메시지 폰트 임시 적용
function applyTempMessageFont(fontName) {
    tempMessageFont = fontName;
    updateUIFont();
}

// 조절값 임시 적용 함수들
function applyTempUIFontSize(size) {
    tempUiFontSize = size;
    updateUIFont();
}

function applyTempUIFontWeight(weight) {
    tempUiFontWeight = weight;
    updateUIFont();
}

function applyTempChatFontSize(size) {
    tempChatFontSize = size;
    updateUIFont();
}

function applyTempInputFontSize(size) {
    tempInputFontSize = size;
    updateUIFont();
}

function applyTempChatFontWeight(weight) {
    tempChatFontWeight = weight;
    updateUIFont();
}

function applyTempChatLineHeight(height) {
    tempChatLineHeight = height;
    updateUIFont();
}

// 이벤트 리스너 설정
function setupEventListeners(template) {
    // 프리셋 드롭다운 변경 이벤트
    template.find('#preset-dropdown').off('change').on('change', function() {
        const presetId = $(this).val();
        if (presetId) {
            selectedPresetId = presetId;
            
            // 선택된 프리셋의 폰트들과 조절값들 즉시 적용
            const presets = settings?.presets || [];
            const currentPreset = presets.find(p => p.id === presetId);
            
            // 폰트 적용
            if (currentPreset && currentPreset.uiFont) {
                applyTempUIFont(currentPreset.uiFont);
            } else {
                applyTempUIFont(null); // 기본 폰트
            }
            if (currentPreset && currentPreset.messageFont) {
                applyTempMessageFont(currentPreset.messageFont);
            } else {
                applyTempMessageFont(null); // 기본 폰트
            }
            
            // 조절값들 적용
            tempUiFontSize = currentPreset?.uiFontSize ?? settings.uiFontSize;
            tempUiFontWeight = currentPreset?.uiFontWeight ?? settings.uiFontWeight;
            tempChatFontSize = currentPreset?.chatFontSize ?? settings.chatFontSize;
            tempInputFontSize = currentPreset?.inputFontSize ?? settings.inputFontSize;
            tempChatFontWeight = currentPreset?.chatFontWeight ?? settings.chatFontWeight;
            tempChatLineHeight = currentPreset?.chatLineHeight ?? settings.chatLineHeight;
            
            renderUIFontSection(template);
            renderMessageFontSection(template);
            setupEventListeners(template);
            updateUIFont(); // 조절값 변경사항 즉시 적용
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
        
                 const presets = settings?.presets || [];
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
                uiFont: null,
                messageFont: null
            };
            
                         // 프리셋 추가
             settings.presets.push(newPreset);
            selectedPresetId = newPreset.id;
            saveSettingsDebounced();
            
            renderPresetDropdown(template);
            renderUIFontSection(template);
            renderMessageFontSection(template);
            setupEventListeners(template);
        }
    });
    
    // UI 폰트 드롭다운 변경 이벤트
    template.find('#ui-font-dropdown').off('change').on('change', function() {
        const fontName = $(this).val();
        if (fontName) {
            applyTempUIFont(fontName);
        } else {
            applyTempUIFont(null); // 기본 폰트
        }
    });
    
    // 메시지 폰트 드롭다운 변경 이벤트
    template.find('#message-font-dropdown').off('change').on('change', function() {
        const fontName = $(this).val();
        if (fontName) {
            applyTempMessageFont(fontName);
        } else {
            applyTempMessageFont(null); // 기본 폰트
        }
    });
    
    // UI 폰트 조절바 이벤트들
    template.find('#ui-font-size-slider').off('input').on('input', function() {
        const size = parseInt($(this).val());
        template.find('#ui-font-size-value').text(size + 'px');
        applyTempUIFontSize(size);
    });
    
    template.find('#ui-font-weight-slider').off('input').on('input', function() {
        const weight = parseFloat($(this).val());
        template.find('#ui-font-weight-value').text(weight.toFixed(1) + 'px');
        applyTempUIFontWeight(weight);
    });
    
    // 채팅 폰트 조절바 이벤트들
    template.find('#chat-font-size-slider').off('input').on('input', function() {
        const size = parseInt($(this).val());
        template.find('#chat-font-size-value').text(size + 'px');
        applyTempChatFontSize(size);
    });
    
    template.find('#input-font-size-slider').off('input').on('input', function() {
        const size = parseInt($(this).val());
        template.find('#input-font-size-value').text(size + 'px');
        applyTempInputFontSize(size);
    });
    
    template.find('#chat-font-weight-slider').off('input').on('input', function() {
        const weight = parseFloat($(this).val());
        template.find('#chat-font-weight-value').text(weight.toFixed(1) + 'px');
        applyTempChatFontWeight(weight);
    });
    
    template.find('#chat-line-height-slider').off('input').on('input', function() {
        const height = parseFloat($(this).val());
        template.find('#chat-line-height-value').text(height.toFixed(1) + 'rem');
        applyTempChatLineHeight(height);
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
            renderMessageFontSection(template);
            renderThemeLinkingSection(template);
            renderFontList(template);
            setupEventListeners(template);
        }
    });
    

    
    // 폰트 삭제 버튼 이벤트
    template.find('.remove-font-btn').off('click').on('click', function() {
        const fontId = $(this).data('id');
        if (confirm('이 폰트를 삭제하시겠습니까?')) {
            deleteFont(template, fontId);
        }
    });
    
    // UI 폰트 기본값 버튼 이벤트
    template.find('#ui-font-reset-btn').off('click').on('click', function() {
        // 기본값으로 초기화
        const defaultUIFontSize = 14;
        const defaultUIFontWeight = 0;
        
        // 임시 값 업데이트
        tempUiFontSize = defaultUIFontSize;
        tempUiFontWeight = defaultUIFontWeight;
        
        // UI 업데이트
        template.find('#ui-font-size-slider').val(defaultUIFontSize);
        template.find('#ui-font-size-value').text(defaultUIFontSize + 'px');
        template.find('#ui-font-weight-slider').val(defaultUIFontWeight);
        template.find('#ui-font-weight-value').text(defaultUIFontWeight.toFixed(1) + 'px');
        
        // 실시간 적용
        updateUIFont();
    });
    
    // 메시지 폰트 기본값 버튼 이벤트
    template.find('#message-font-reset-btn').off('click').on('click', function() {
        // 기본값으로 초기화
        const defaultChatFontSize = 14;
        const defaultInputFontSize = 14;
        const defaultChatFontWeight = 0;
        const defaultChatLineHeight = 1.2;
        
        // 임시 값 업데이트
        tempChatFontSize = defaultChatFontSize;
        tempInputFontSize = defaultInputFontSize;
        tempChatFontWeight = defaultChatFontWeight;
        tempChatLineHeight = defaultChatLineHeight;
        
        // UI 업데이트
        template.find('#chat-font-size-slider').val(defaultChatFontSize);
        template.find('#chat-font-size-value').text(defaultChatFontSize + 'px');
        template.find('#input-font-size-slider').val(defaultInputFontSize);
        template.find('#input-font-size-value').text(defaultInputFontSize + 'px');
        template.find('#chat-font-weight-slider').val(defaultChatFontWeight);
        template.find('#chat-font-weight-value').text(defaultChatFontWeight.toFixed(1) + 'px');
        template.find('#chat-line-height-slider').val(defaultChatLineHeight);
        template.find('#chat-line-height-value').text(defaultChatLineHeight.toFixed(1) + 'rem');
        
        // 실시간 적용
        updateUIFont();
    });
    
    // 테마 연동 추가 버튼
    template.find('#add-theme-rule-btn').off('click').on('click', function() {
        const themeName = template.find('#theme-name-input').val().trim();
        const presetId = template.find('#theme-preset-dropdown').val();
        
        if (!themeName) {
            alert('테마 이름을 입력해주세요.');
            return;
        }
        
        if (!presetId) {
            alert('연동할 프리셋을 선택해주세요.');
            return;
        }
        
        // 중복 검사
        const themeRules = settings?.themeRules || [];
        if (themeRules.find(rule => rule.themeName === themeName)) {
            alert('이미 연동된 테마 이름입니다.');
            return;
        }
        
        // 새 연동 규칙 추가
        const newRule = {
            id: generateId(),
            themeName: themeName,
            presetId: presetId
        };
        
        settings.themeRules.push(newRule);
        
        // UI 초기화 및 업데이트
        template.find('#theme-name-input').val('');
        template.find('#theme-preset-dropdown').val('');
        renderThemeRulesList(template);
        setupThemeRuleEventListeners(template);
        
        saveSettingsDebounced();
        alert('테마 연동이 추가되었습니다.');
    });
    
    // 테마 연동 삭제 버튼들에 이벤트 추가
    setupThemeRuleEventListeners(template);
}

// 테마 규칙 이벤트 리스너 설정
function setupThemeRuleEventListeners(template) {
    template.find('.remove-theme-rule-btn').off('click').on('click', function() {
        const ruleId = $(this).data('id');
        if (confirm('이 테마 연동을 삭제하시겠습니까?')) {
            deleteThemeRule(template, ruleId);
        }
    });
}

// 테마 규칙 삭제
function deleteThemeRule(template, ruleId) {
    if (!settings?.themeRules) return;
    
    const themeRules = settings.themeRules;
    const ruleIndex = themeRules.findIndex(rule => rule.id === ruleId);
    
    if (ruleIndex !== -1) {
        themeRules.splice(ruleIndex, 1);
        
        // UI 업데이트
        renderThemeRulesList(template);
        setupThemeRuleEventListeners(template);
        
        saveSettingsDebounced();
    }
}

// 현재 설정값들을 전역 설정에 저장 (팝업 저장 버튼용)
function saveCurrentSettingsToGlobal() {
    // 현재 임시값들을 전역 설정에 저장
    if (tempUiFontSize !== null) {
        settings.uiFontSize = tempUiFontSize;
    }
    if (tempUiFontWeight !== null) {
        settings.uiFontWeight = tempUiFontWeight;
    }
    if (tempChatFontSize !== null) {
        settings.chatFontSize = tempChatFontSize;
    }
    if (tempInputFontSize !== null) {
        settings.inputFontSize = tempInputFontSize;
    }
    if (tempChatFontWeight !== null) {
        settings.chatFontWeight = tempChatFontWeight;
    }
    if (tempChatLineHeight !== null) {
        settings.chatLineHeight = tempChatLineHeight;
    }
    
    // 설정 저장
    saveSettingsDebounced();
    
    // UI 업데이트 (현재 적용된 스타일 유지)
    updateUIFont();
}

// 현재 프리셋 저장
function saveCurrentPreset() {
    if (!selectedPresetId) return;
    
    const presets = settings?.presets || [];
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset) {
        preset.uiFont = tempUiFont;
        preset.messageFont = tempMessageFont;
        // 조절값들도 저장
        preset.uiFontSize = tempUiFontSize ?? settings.uiFontSize;
        preset.uiFontWeight = tempUiFontWeight ?? settings.uiFontWeight;
        preset.chatFontSize = tempChatFontSize ?? settings.chatFontSize;
        preset.inputFontSize = tempInputFontSize ?? settings.inputFontSize;
        preset.chatFontWeight = tempChatFontWeight ?? settings.chatFontWeight;
        preset.chatLineHeight = tempChatLineHeight ?? settings.chatLineHeight;
        
        // 현재 프리셋으로 설정
        settings.currentPreset = selectedPresetId;
        
        saveSettingsDebounced();
        updateUIFont();
    }
}

// 프리셋 삭제
function deletePreset(template, presetId) {
    if (!settings?.presets) return;
    
    const presets = settings.presets;
    const presetIndex = presets.findIndex(p => p.id === presetId);
    
    if (presetIndex !== -1) {
        presets.splice(presetIndex, 1);
        
        // 현재 프리셋이 삭제된 프리셋이면 초기화
        if (settings.currentPreset === presetId) {
            settings.currentPreset = null;
        }
        
        // 선택된 프리셋 조정
        if (presets.length > 0) {
            selectedPresetId = presets[0].id;
        } else {
            selectedPresetId = null;
        }
        
        // UI 업데이트
        renderPresetDropdown(template);
        renderUIFontSection(template);
        renderMessageFontSection(template);
        renderThemeLinkingSection(template);
        setupEventListeners(template);
        
        saveSettingsDebounced();
        updateUIFont();
    }
}

// 폰트 삭제
function deleteFont(template, fontId) {
    if (!settings?.fonts) return;
    
    const fonts = settings.fonts;
    const fontIndex = fonts.findIndex(f => f.id === fontId);
    
    if (fontIndex !== -1) {
        // 배열에서 제거
        fonts.splice(fontIndex, 1);
        
        // UI 업데이트
        renderUIFontSection(template);
        renderMessageFontSection(template);
        renderThemeLinkingSection(template);
        renderFontList(template);
        setupEventListeners(template);
        
        saveSettingsDebounced();
        updateUIFont();
    }
}

// 모든 폰트 업데이트 (초기 로드용)  
function updateAllFonts() {
    updateUIFont();
    // 테마 자동 감지 시작
    startThemeDetection();
}

// 테마 감지 및 자동 프리셋 적용 시작
function startThemeDetection() {
    // 페이지 로드 시 한 번 실행
    setTimeout(() => {
        checkAndApplyThemePreset();
    }, 1000);
    
    // SillyTavern 테마 적용 이벤트 감지
    setupSillyTavernThemeListeners();
}

// 테마 확인 및 자동 프리셋 적용
function checkAndApplyThemePreset() {
    const themeRules = settings?.themeRules || [];
    
    if (themeRules.length === 0) {
        return;
    }
    
    // 감지된 테마 이름 확인 (console.log 후킹으로 캐치된 것)
    const detectedTheme = window.fontManagerDetectedTheme;
    if (!detectedTheme) {
        return;
    }
    
    // 테마 규칙 확인
    let matchedRule = null;
    
    for (const rule of themeRules) {
        if (!rule.themeName) continue;
        
        const themeNameLower = rule.themeName.toLowerCase();
        const detectedThemeLower = detectedTheme.toLowerCase();
        
        // 테마 이름 매칭 (정확히 일치하거나 포함되는지 확인)
        const isMatched = themeNameLower === detectedThemeLower || 
                         detectedThemeLower.includes(themeNameLower) ||
                         themeNameLower.includes(detectedThemeLower);
        
        if (isMatched) {
            matchedRule = rule;
            break;
        }
    }
    
    if (matchedRule) {
        // 매칭된 프리셋 적용
        applyPresetById(matchedRule.presetId);
    }
}

// ID로 프리셋 적용
function applyPresetById(presetId) {
    const presets = settings?.presets || [];
    const preset = presets.find(p => p.id === presetId);
    
    if (!preset) {
        return;
    }
    
    // 현재 프리셋 설정
    settings.currentPreset = presetId;
    
    // 프리셋의 폰트들과 조절값들을 임시 변수에 설정
    tempUiFont = preset.uiFont || null;
    tempMessageFont = preset.messageFont || null;
    tempUiFontSize = preset.uiFontSize ?? settings.uiFontSize;
    tempUiFontWeight = preset.uiFontWeight ?? settings.uiFontWeight;
    tempChatFontSize = preset.chatFontSize ?? settings.chatFontSize;
    tempInputFontSize = preset.inputFontSize ?? settings.inputFontSize;
    tempChatFontWeight = preset.chatFontWeight ?? settings.chatFontWeight;
    tempChatLineHeight = preset.chatLineHeight ?? settings.chatLineHeight;
    
    // 전역 설정에도 반영
    settings.uiFontSize = tempUiFontSize;
    settings.uiFontWeight = tempUiFontWeight;
    settings.chatFontSize = tempChatFontSize;
    settings.inputFontSize = tempInputFontSize;
    settings.chatFontWeight = tempChatFontWeight;
    settings.chatLineHeight = tempChatLineHeight;
    
    // 폰트 적용
    updateUIFont();
    
    // 설정 저장
    saveSettingsDebounced();
}

// SillyTavern 테마 이벤트 감지 설정
function setupSillyTavernThemeListeners() {
    // console.log 후킹으로 "theme applied:" 메시지 감지
    const originalConsoleLog = console.log;
    console.log = function(...args) {
        originalConsoleLog.apply(console, args);
        
        const message = args.join(' ');
        if (message.includes('theme applied:')) {
            const themeMatch = message.match(/theme applied:\s*(.+)/i);
            if (themeMatch) {
                const themeName = themeMatch[1].trim();
                // 감지된 테마 이름을 저장
                window.fontManagerDetectedTheme = themeName;
                setTimeout(() => {
                    checkAndApplyThemePreset();
                }, 200);
            }
        }
    };
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
    } catch (error) {
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
        // 버튼 로드 실패시 재시도
        setTimeout(addToWandMenu, 1000);
    }
}

// 확장 초기화
jQuery(async () => {
    initSettings();
    await addToWandMenu();
    updateAllFonts();
    
    // SillyTavern 로드 완료 후 슬래시 커맨드 등록
    setTimeout(registerSlashCommands, 2000);
}); 