import {test, expect} from '@playwright/test';
import type {Locator, Page} from '@playwright/test';
import * as CONSTANTS from '../../constants';

const setupInput = async (page: Page, mode: 'clear' | 'reset') => {
  const inputLocator = await page.locator(`div#MarkdownInput_Example`);
  await page.click(`[data-testid="${mode}"]`);

  return inputLocator;
};

const OPERATION_MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';

test.beforeEach(async ({page, context, browserName}) => {
  await page.goto('http://localhost:19006/', {waitUntil: 'load'});
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-write', 'clipboard-read']);

  //   await page.click('[data-testid="clear"]');
});

const pasteContent = async ({text, page, inputLocator}: {text: string; page: Page; inputLocator: Locator}) => {
  await page.evaluate(async (pasteText) => navigator.clipboard.writeText(pasteText), text);
  await inputLocator.focus();
  await inputLocator.press(`${OPERATION_MODIFIER}+v`);
};

test('paste', async ({page}) => {
  const PASTE_TEXT = 'bold';
  const boldStyleDefinition = CONSTANTS.MARKDOWN_STYLE_DEFINITIONS.bold;

  const inputLocator = await setupInput(page, 'clear');

  const wrappedText = boldStyleDefinition.wrapContent(PASTE_TEXT);
  await pasteContent({text: wrappedText, page, inputLocator});

  const elementHandle = await inputLocator.locator('span', {hasText: PASTE_TEXT}).last();
  let elementStyle;
  if (elementHandle) {
    await elementHandle.waitFor({state: 'attached'});

    elementStyle = await elementHandle.getAttribute('style');
  }
  expect(elementStyle).toEqual(boldStyleDefinition.style);
});

test('select', async ({page}) => {
  const inputLocator = await setupInput(page, 'reset');
  //   await pasteContent({text: SELECTION_TEXT, page, inputLocator});
  await inputLocator.focus();

  const cursorPosition = await page.evaluate(() => {
    const editableDiv = document.querySelector('div[contenteditable="true"]');
    const range = window.getSelection()?.getRangeAt(0);
    if (!range || !editableDiv) return null;
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editableDiv);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  });

  expect(cursorPosition).toBe(CONSTANTS.EXAMPLE_CONTENT.length);
});

test('paste replace', async ({page}) => {
  const inputLocator = await setupInput(page, 'reset');

  await inputLocator.focus();
  await inputLocator.press(`${OPERATION_MODIFIER}+a`);

  const newText = '*bold*';
  await pasteContent({text: newText, page, inputLocator});

  expect(await inputLocator.innerText()).toBe(newText);
});

test('paste undo', async ({page}) => {
  const PASTE_TEXT_FIRST = '*bold*';
  const PASTE_TEXT_SECOND = '@here';

  const inputLocator = await setupInput(page, 'clear');

  await page.evaluate(async (pasteText) => navigator.clipboard.writeText(pasteText), PASTE_TEXT_FIRST);

  await inputLocator.press(`${OPERATION_MODIFIER}+v`);
  await page.waitForTimeout(CONSTANTS.INPUT_HISTORY_DEBOUNCE_TIME_MS);
  await page.evaluate(async (pasteText) => navigator.clipboard.writeText(pasteText), PASTE_TEXT_SECOND);
  await inputLocator.press(`${OPERATION_MODIFIER}+v`);
  await page.waitForTimeout(CONSTANTS.INPUT_HISTORY_DEBOUNCE_TIME_MS);

  await inputLocator.press(`${OPERATION_MODIFIER}+z`);

  expect(await inputLocator.innerText()).toBe(PASTE_TEXT_FIRST);
});

test('paste redo', async ({page}) => {
  const PASTE_TEXT_FIRST = '*bold*';
  const PASTE_TEXT_SECOND = '@here';

  const inputLocator = await setupInput(page, 'clear');

  await page.evaluate(async (pasteText) => navigator.clipboard.writeText(pasteText), PASTE_TEXT_FIRST);
  await inputLocator.press(`${OPERATION_MODIFIER}+v`);
  await page.waitForTimeout(CONSTANTS.INPUT_HISTORY_DEBOUNCE_TIME_MS);
  await page.evaluate(async (pasteText) => navigator.clipboard.writeText(pasteText), PASTE_TEXT_SECOND);
  await page.waitForTimeout(CONSTANTS.INPUT_HISTORY_DEBOUNCE_TIME_MS);
  await inputLocator.press(`${OPERATION_MODIFIER}+v`);
  await page.waitForTimeout(CONSTANTS.INPUT_HISTORY_DEBOUNCE_TIME_MS);

  await inputLocator.press(`${OPERATION_MODIFIER}+z`);
  await inputLocator.press(`${OPERATION_MODIFIER}+Shift+z`);

  expect(await inputLocator.innerText()).toBe(`${PASTE_TEXT_FIRST}${PASTE_TEXT_SECOND}`);
});

test('cut content changes', async ({page}) => {
  const INITIAL_CONTENT = 'bold';
  const WRAPPED_CONTENT = CONSTANTS.MARKDOWN_STYLE_DEFINITIONS.bold.wrapContent(INITIAL_CONTENT);
  const EXPECTED_CONTENT = CONSTANTS.MARKDOWN_STYLE_DEFINITIONS.bold.wrapContent(INITIAL_CONTENT).slice(0, 3);

  const inputLocator = await setupInput(page, 'clear');
  await pasteContent({text: WRAPPED_CONTENT, page, inputLocator});
  const rootHandle = await inputLocator.locator('span.root').first();

  await page.evaluate(async (initialContent) => {
    const filteredNode = Array.from(document.querySelectorAll('div[contenteditable="true"] > span.root span')).find((node) => {
      return node.textContent?.includes(initialContent) && node.nextElementSibling && node.nextElementSibling.textContent?.includes('*');
    });

    const startNode = filteredNode;
    const endNode = filteredNode?.nextElementSibling;

    if (startNode?.firstChild && endNode?.lastChild) {
      const range = new Range();
      range.setStart(startNode.firstChild, 2);
      range.setEnd(endNode.lastChild, endNode.lastChild.textContent?.length ?? 0);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, INITIAL_CONTENT);

  await inputLocator.focus();
  await inputLocator.press(`${OPERATION_MODIFIER}+x`);

  expect(await rootHandle.innerHTML()).toBe(EXPECTED_CONTENT);
});
