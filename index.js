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
    currentPreset: null
};

// 현재 선택된 프리셋 ID와 임시 UI 폰트
let selectedPresetId = null;
let tempUiFont = null;
let originalUIStyles = null;
let fontStyle = null;
let settings = null;

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
        console.log('[Font-Manager] 새 폰트 추가됨:', newFont);
        
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
    
    // 현재 프리셋의 폰트 미리 적용
    if (selectedPresetId) {
        const currentPreset = presets.find(p => p.id === selectedPresetId);
        if (currentPreset && currentPreset.uiFont) {
            applyTempUIFont(currentPreset.uiFont);
        }
    }
    
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
        tempUiFont = null;
    }
    
    // 임시 변수 초기화
    tempUiFont = null;
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
        tempUiFont: tempUiFont
    };
}

// 원본 UI 스타일 복원
function restoreOriginalUIStyles() {
    // 원본 상태로 복원
    if (originalUIStyles) {
        tempUiFont = originalUIStyles.tempUiFont;
    } else {
        tempUiFont = null;
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
            console.log('[Font-Manager] CSS에서 추출된 font-family:', fontFamily);
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
        console.log('[Font-Manager] CSS sanitization 시작');
        const style = document.createElement('style');
        style.innerHTML = css;
        document.head.append(style);
        const sheet = style.sheet;
        
        if (!sheet) {
            console.warn('[Font-Manager] CSS sheet이 null입니다. 원본 CSS 반환');
            style.remove();
            return css;
        }
        
        const rules = Array.from(sheet.cssRules).map(it => (it.cssText) ?? '').join('\n');
        style.remove();
        console.log('[Font-Manager] CSS sanitization 성공');
        return rules;
    } catch (error) {
        console.warn('[Font-Manager] CSS sanitization 실패:', error);
        return css; // 실패시 원본 반환
    }
};

// UI 폰트 업데이트
function updateUIFont() {
    console.log('[Font-Manager] updateUIFont() 호출됨');
    
    if (!fontStyle) {
        fontStyle = document.createElement('style');
        fontStyle.id = 'font-manager--ui-fonts';
        document.head.append(fontStyle);
        console.log('[Font-Manager] 새 스타일 태그 생성:', fontStyle);
    }
    
    const fontCss = [];
    const uiFontCss = [];
    
    // 모든 폰트 CSS 적용
    const fonts = settings?.fonts || [];
    console.log('[Font-Manager] 로드된 폰트 목록:', fonts);
    
    fonts.forEach(font => {
        if (font.type === 'source') {
            console.log(`[Font-Manager] 폰트 CSS 추가: ${font.name}`);
            fontCss.push(`/* FONT: ${font.name} */\n${font.data}`);
        }
    });
    
    // 현재 UI 폰트 적용
    const currentFontName = tempUiFont || getCurrentPresetUIFont();
    console.log('[Font-Manager] 현재 적용할 폰트:', currentFontName);
    console.log('[Font-Manager] tempUiFont:', tempUiFont);
    console.log('[Font-Manager] getCurrentPresetUIFont():', getCurrentPresetUIFont());
    
    // 실제 사용할 font-family 이름 찾기
    let actualFontFamily = currentFontName;
    if (currentFontName) {
        const selectedFont = fonts.find(font => font.name === currentFontName);
        if (selectedFont && selectedFont.fontFamily) {
            actualFontFamily = selectedFont.fontFamily;
            console.log(`[Font-Manager] 실제 font-family 사용: ${actualFontFamily} (원래: ${currentFontName})`);
        }
    }
    
    if (currentFontName && actualFontFamily) {
        console.log(`[Font-Manager] UI 폰트 CSS 생성: ${actualFontFamily}`);
        uiFontCss.push(`
/* UI FONT APPLICATION */
body,
input,
select,
span,
code,
.list-group-item,
.ui-widget-content .ui-menu-item-wrapper,
textarea:not(#send_textarea) {
  font-family: "${actualFontFamily}", var(--ui-default-font), Sans-Serif !important;
  font-weight: normal !important;
  line-height: 1.1rem;
  -webkit-text-stroke: var(--ui-font-weight);
}

*::before,
i {
  font-family: "${actualFontFamily}", Sans-Serif, "Font Awesome 6 Free", "Font Awesome 6 Brands" !important;
  filter: none !important;
  text-shadow: none !important;
}

.drawer-content,
textarea,
.drawer-icon {
  border: 0;
  color: var(--default-font-color) !important;
}

.interactable,
.fa-solid {
  transition: all 0.3s !important;
}
        `);
    }
    
    const finalCss = [
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
    
    console.log('[Font-Manager] 생성된 CSS:', finalCss);
    
    const sanitizedCss = sanitize(finalCss);
    console.log('[Font-Manager] Sanitized CSS:', sanitizedCss);
    
    fontStyle.innerHTML = sanitizedCss;
    console.log('[Font-Manager] 스타일 태그에 CSS 적용 완료');
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

// UI 폰트 임시 적용
function applyTempUIFont(fontName) {
    console.log('[Font-Manager] applyTempUIFont 호출:', fontName);
    tempUiFont = fontName;
    updateUIFont();
}

// 이벤트 리스너 설정
function setupEventListeners(template) {
    // 프리셋 드롭다운 변경 이벤트
    template.find('#preset-dropdown').off('change').on('change', function() {
        const presetId = $(this).val();
        if (presetId) {
            selectedPresetId = presetId;
            
            // 선택된 프리셋의 UI 폰트 즉시 적용
            const presets = settings?.presets || [];
            const currentPreset = presets.find(p => p.id === presetId);
            if (currentPreset && currentPreset.uiFont) {
                applyTempUIFont(currentPreset.uiFont);
            } else {
                applyTempUIFont(null); // 기본 폰트
            }
            
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
                uiFont: null
            };
            
                         // 프리셋 추가
             settings.presets.push(newPreset);
            selectedPresetId = newPreset.id;
            saveSettingsDebounced();
            
            renderPresetDropdown(template);
            renderUIFontSection(template);
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
    
    const presets = settings?.presets || [];
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset) {
        preset.uiFont = tempUiFont;
        
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
        renderFontList(template);
        setupEventListeners(template);
        
        saveSettingsDebounced();
        updateUIFont();
    }
}

// 모든 폰트 업데이트 (초기 로드용)  
function updateAllFonts() {
    updateUIFont();
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
    initSettings();
    await addToWandMenu();
    updateAllFonts();
    
    // SillyTavern 로드 완료 후 슬래시 커맨드 등록
    setTimeout(registerSlashCommands, 2000);
    
    console.log("Font-Manager 확장이 로드되었습니다.");
}); 