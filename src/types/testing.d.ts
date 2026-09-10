/**
 * Pulls Jest's globals (`describe`, `it`, `expect`, `jest`) into the program.
 *
 * A `types` array in tsconfig would work too, but it replaces the automatic
 * inclusion of every other @types package rather than adding to it — this
 * reference is additive and cannot silently drop Expo's or React's types.
 */
/// <reference types="jest" />
