/** Extracts the function signature for the signal `S`. */
type SignalCallbackType<S> = S extends Signal<infer C> ? C : never


interface SlotWithoutFunction<SIGNAL extends Signal<any>> {
    /** Set the function for the slot.
     * If there already is a function, all the signals tracked in this slot
     * are disconnected from it. Then it's replaced with the new one.
     *
     * This returns this object typed as `SlotWithFunction`, which exposes
     * methods for connecting/disconnecting signals, intended for chaining
     * methods calls.
     * */
    set_function: (function_: SignalCallbackType<SIGNAL>, this_: Object | null) => SlotWithFunction<SIGNAL>
    /** Type guard to get a properly typed version for when we have a function.
     *
     * Use this to get this object as a `SlotWithFunction`, which exposes the
     * methods for connecting/disconnecting signals.
     *
     * This is useful when not chaining calls after `.set_function`, which
     * would otherwise be the only canonical way to get this object as that
     * type.
     * */
    has_function(): this is SlotWithFunction<SIGNAL>
}


interface SlotWithFunction<SIGNAL extends Signal<any>> extends SlotWithoutFunction<SIGNAL> {
    /** Connects `signal` to the function. */
    connect: (signal: SIGNAL) => this
    /** Disconnects `signal` from the function. */
    disconnect: (signal: SIGNAL) => this
    /** Disconnects all signals from the function. */
    disconnect_all: () => this
}


type SlotMaybeWithFunction<SIGNAL extends Signal<any>> = SlotWithFunction<SIGNAL> | SlotWithoutFunction<SIGNAL>


/** Wraps a function meant to connect to a specific type of Qt signal.
 * Revolves around two states: Has a function or doesn't. Those states are
 * modeled by two interfaces that represent instances of this class in either
 * of those states:
 *  - `SlotWithFunction` when there's guaranteed to be a function.
 *  - `SlotWithoutFunction` when there isn't.
 *
 *  The type `SlotMaybeWithFunction` is a union of those two types and
 *  represents the default state. Variables holding instances of this class
 *  should be of that type. That's why the constructor of this class is
 *  private, so the static `.new` method has to be used to obtain a
 *  `SlotMaybeWithFunction`-typed instance.
 * */
class Slot<SIGNAL extends Signal<any>> implements SlotWithFunction<SIGNAL> {
    protected function?: SignalCallbackType<SIGNAL>
    protected signals = new Set<SIGNAL>()

    // Private to enforce use of the static method `.new`, which returns this
    // as `SlotMaybeWithFunction`. That way, the rvalue doesn't have to be
    // manually annotated with tha type.
    private constructor() {}

    /** Obtain a newly constructed instance. */
    static new<SIGNAL extends Signal<any>>(): SlotMaybeWithFunction<SIGNAL> {
        return new this()
    }

    connect(signal: SIGNAL): this {
        this.signals.add(signal)
        signal.connect(this.function)
        return this
    }

    disconnect(signal: SIGNAL): this {
        if (this.signals.has(signal)) {
            signal.disconnect(this.function)
            this.signals.delete(signal)
        }
        return this
    }

    disconnect_all(): this {
        this.signals.forEach((signal: SIGNAL) => {
            this.disconnect(signal)
        })
        return this
    }

    set_function(function_: SignalCallbackType<SIGNAL>, this_: Object | null = null): SlotWithFunction<SIGNAL> {
        this.disconnect_all()
        if (this_ === null) {
            this.function = function_
        } else {
            // There is some weird issue that the binding of arrow functions is
            // suddenly lost after if-checks in closures, but only within the
            // if-block itself.
            // It's also not related to access - accessing the variable
            // more than once before entering the if-block doesn't change
            // anything. Ternary expressions or closures (if nested in the
            // closure) aren't affected either.
            // TODO: Figure out why that happens.
            //
            // Current solution: The issue doesn't seem to occur with
            // explicitly bound functions, so we explicitly bind here.
            //
            // The reason why we don't bind at the call site is static typing:
            // If we add a `.bind(this)` at the end of the function's
            // definition at the call site the typing of `function_` won't
            // propagate into the definition.
            this.function = function_.bind(this_)
        }
        return this as SlotWithFunction<SIGNAL>
    }

    has_function(): this is SlotWithFunction<SIGNAL> {
        return this.function ? true : false
    }
}





export {
    Slot
}
