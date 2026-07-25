/** Bidirectional transform between input `I` and output `O` (sync or async). */
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
 * Compose codecs left-to-right for encode (right-to-left for decode).
 * Type-checks that each codec’s input matches the previous codec’s output.
 */
export const codecPipe = <Cs extends readonly [Codec, ...Codec[]]>(...codecs: Cs) =>
  ({
    encode: (value) => codecs.reduce((acc, codec) => acc.then((v) => codec.encode(v)), Promise.resolve(value)),
    decode: (value) => codecs.reduceRight((acc, codec) => acc.then((v) => codec.decode(v)), Promise.resolve(value)),
  }) as Composable<Cs> extends true ? Codec<InOf<First<Cs>>, OutOf<Last<Cs>>> : never
