"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const helper_1 = require("../helper");
(0, globals_1.describe)('helper methods', () => {
    (0, globals_1.test)('getDueOn', () => {
        globals_1.jest.useFakeTimers().setSystemTime(new Date('2024-09-10'));
        (0, globals_1.expect)((0, helper_1.getDueOn)(0)).toBe('2024-09-10');
        (0, globals_1.expect)((0, helper_1.getDueOn)(1)).toBe('2024-09-11');
        (0, globals_1.expect)((0, helper_1.getDueOn)(2)).toBe('2024-09-12');
        (0, globals_1.expect)((0, helper_1.getDueOn)(3)).toBe('2024-09-13');
        (0, globals_1.expect)((0, helper_1.getDueOn)(4)).toBe('2024-09-16');
        (0, globals_1.expect)((0, helper_1.getDueOn)(5)).toBe('2024-09-17');
        (0, globals_1.expect)((0, helper_1.getDueOn)(6)).toBe('2024-09-18');
        (0, globals_1.expect)((0, helper_1.getDueOn)(7)).toBe('2024-09-19');
        (0, globals_1.expect)((0, helper_1.getDueOn)(8)).toBe('2024-09-20');
        (0, globals_1.expect)((0, helper_1.getDueOn)(9)).toBe('2024-09-23');
        (0, globals_1.expect)((0, helper_1.getDueOn)(25)).toBe('2024-10-15');
    });
});
