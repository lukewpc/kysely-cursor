/**
 * A bidirectional transformer between two value types: input `I` and output `O`.
 *
 * @template I The type accepted by `encode` and produced by `decode`.
 * @template O The type produced by `encode` and accepted by `decode`.
 *
 * @property {(value: I) => Promise<O> | O} encode
 * Transform an input value `I` into an output value `O`. May be sync or async.
 *
 * @property {(value: O) => Promise<I> | I} decode
 * Inverse transform: turn an output value `O` back into an input value `I`. May be sync or async.
 */
export type Codec<I = any, O = any> = {
  encode: (value: I) => Promise<O> | O
  decode: (value: O) => Promise<I> | I
}

type InOf<C> = C extends Codec<infer I, any> ? I : never
type OutOf<C> = C extends Codec<any, infer O> ? O : never

type First<T extends readonly unknown[]> = T extends readonly [infer F, ...unknown[]] ? F : never
type Last<T extends readonly unknown[]> = T extends readonly [...unknown[], infer L] ? L : never

type Composable<Cs extends readonly Codec[]> = Cs extends readonly []
  ? true
  : Cs extends readonly [Codec]
    ? true
    : Cs extends readonly [infer A, infer B, ...infer R]
      ? A extends Codec<any, infer AO>
        ? B extends Codec<infer BI, any>
          ? [AO] extends [BI]
            ? Composable<[B, ...(R extends readonly Codec[] ? R : never)]>
            : false
          : false
        : false
      : false

/**
 * Compose a non-empty list of codecs into a single codec.
 * Validates that the codecs are type-composable: the input of each codec must be the output of the previous.
 *
 * - `encode` runs **left → right** through the provided codecs.
 * - `decode` runs **right → left** (the inverse order).
 *
 * @template Cs A non-empty readonly tuple of codecs to compose.
 * @param {...Cs} codecs The codecs to compose, in the order their `encode` functions should run.
 * @returns Codec<InOf<First<Cs>>, OutOf<Last<Cs>>> A codec representing the composition, or `never` if the codecs are not type-composable.
 */
export const codecPipe = <Cs extends readonly [Codec, ...Codec[]]>(...codecs: Cs) =>
  ({
    encode: (value) => codecs.reduce((acc, codec) => acc.then((v) => codec.encode(v)), Promise.resolve(value)),
    decode: (value) => codecs.reduceRight((acc, codec) => acc.then((v) => codec.decode(v)), Promise.resolve(value)),
  }) as Composable<Cs> extends true ? Codec<InOf<First<Cs>>, OutOf<Last<Cs>>> : never
