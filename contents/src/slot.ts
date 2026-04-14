import { Bimap } from "./bimap"


interface OnDisconnectedCallback {
    (slot: SlotWithFunction<any>, signal: Signal<any>): void
}


interface OnConnectedCallback {
    (slot: SlotWithFunction<any>, signal: Signal<any>): OnDisconnectedCallback
}


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
    connect: (signal: SIGNAL, on_connected_callback?: OnConnectedCallback) => this
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
 *  represents the default state (which is the lowest common denominator of the
 *  union, `SlotWithoutFunction`). Variables holding instances of this class
 *  should be of that type. That's why the constructor of this class is
 *  private, so the static `.new` method has to be used to obtain a
 *  `SlotMaybeWithFunction`-typed instance.
 * */
class Slot<SIGNAL extends Signal<any>> implements SlotWithFunction<SIGNAL> {
    protected function?: SignalCallbackType<SIGNAL>
    protected signals = new Set<SIGNAL>()
    protected on_disconnected_callbacks_by_signal = new Map<
        SIGNAL,
        OnDisconnectedCallback | undefined
    >()

    // Private to enforce use of the static method `.new`, which returns this
    // as `SlotMaybeWithFunction`. That way, manual annotation with that type
    // at the callsite isn't required and the ambiguity is enforced.
    private constructor() {}

    /** Obtain a newly constructed instance. */
    static new<SIGNAL extends Signal<any>>(): SlotMaybeWithFunction<SIGNAL> {
        return new this()
    }

    // NOTE: Find the "double callback structure" note-comment further below
    // in the `Disconnecter` class for more on on the design of `.connect` and
    // the related callback structure and disconnection handling.

    /** Connects a signal to our function.
     * Optionally takes `on_connect_connected_callback`. If provided, it'll get
     * called and the slot and the signal passed to it, and the callback
     * it returns will be kept and called later by the slot right after the
     * slot disconnected from the signal.
     *
     * This allows for external signal connection management to get hooked
     * in, with the callback serving as a way to get the two key pieces:
     * The slot and the signal. Also, since disconnects might also happen
     * by the slot getting called directly, there has to be a way for such
     * external connection management to hook into that. That's why the
     * callback returns a callback (presumably defined as a part of the
     * external signal management) that'll be run by the slot on disconnect.
     * */
    connect(signal: SIGNAL, on_connected_callback?: OnConnectedCallback): this {
        this.signals.add(signal)
        if (on_connected_callback) {
            this.on_disconnected_callbacks_by_signal.set(
                signal,
                on_connected_callback(this as SlotWithFunction<SIGNAL>, signal)
            )
        }
        signal.connect(this.function)
        return this
    }

    disconnect(signal: SIGNAL): this {
        if (this.signals.has(signal)) {
            signal.disconnect(this.function)
            let on_disconnected_callback = this.on_disconnected_callbacks_by_signal.get(signal)
            if (on_disconnected_callback) {
                on_disconnected_callback(this as SlotWithFunction<SIGNAL>, signal)
                this.on_disconnected_callbacks_by_signal.delete(signal)
            }
            this.signals.delete(signal)
        }
        return this
    }

    disconnect_all(): this {
        this.signals.forEach((_, signal) => {
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


/** Allows disconnecting all the slot/signal connections managed by this.
 * In order for a connection to be managed, pass the callback returned by
 * `.get_on_connected_callback()` to the `.connect` method of a
 * `SlotWithFunction`.
 *
 * This makes it possible to bundle connections from several different slots
 * and/or subsets of connections from a slot to disconnect later.
 * */
class Disconnecter {
    /** 'a' is slot and 'b' is signal. */
    protected connected_slot_signal_pairs = new Bimap<SlotWithFunction<Signal<any>>, Signal<any>>()

    disconnect_all() {
        this.connected_slot_signal_pairs.forEach((signal, slot) => {
            slot.disconnect(signal)
        })
    }

    // NOTE (double callback structure):
    // The two methods below (the "get_on_..." ones) exist in the way
    // they do to leave it open how the disconnecting is implemented. By
    // designing it that way, it'd be possible to do something altogether
    // different from this here `Disconnecter` class, e.g. to just pass
    // closures to a `SlotWithFunction`'s `.connect` method directly without
    // any of this here, or implement some other disconnect/slot management
    // system.
    //
    // The less convoluted but more tightly coupled option would've been to
    // just write the Slot interfaces and class with a Disconnecter
    // (or some kind of basic "SlotManager" interface or parent class of
    // `Disconnecter`) in mind and directly pass the object to a
    // `SlotWithFunction`'s `.connect`, where the Slot would then call the
    // `on_connected` and `on_disconnected` methods on the object directly.
    //
    // The upside is that this makes the code more reusable for other projects,
    // but it also opens up the code base for more heterogenous approaches,
    // potentially hurting maintainability.
    //
    // The verbosity of the code at the callsite caused by having to
    // explicitely call `.get_on_connected_callback()` could be mitigated by
    // making the typing for the callback in the `SlotWithFunction`'s
    // `.connect` a union with `Disconnecter` (or a base interface or parent
    // class) and simply pass the object. Yes, that'd couple the
    // interfaces/classes, but only on paper, without taking away any of the
    // flexibility to implement different approaches.
    //
    // The reason the callbacks aren't defined as closures in the respective
    // "get_on_..." methods but in distinct methods instead is so they can be
    // easily overriden in subclasses.
    // They're protected to make sure they're not accidentally passed without
    // the binding that happens in the "get_on_..." methods.

    /** Pass the callback returned by this here method to a
     * `SlotWithFunction`'s `.connect` method, which will call it in
     * that same call to pass to us the signal and slot to track.
     * 
     * See `.on_connected_callback` for more.
     *
     * The returned callback is a bound version of `.on_connected_callback`,
     * which may be overridden in a subclass to change behaviour.
     */
    get_on_connected_callback(): OnConnectedCallback {
        return this.on_connected_callback.bind(this)
    }

    /** Called by `on_connected_callback` to obtain the
     * `on_disconnected_callback` it'll return inside `SlotWithFunction`'s
     * `.connect`, so the slot can store it for later in case the disconnect
     * happens on its side. It'll then call that, executing the code required
     * to make us stop tracking that already disconnected signal connection.
     *
     * See `on_disconnected_callback` for more.
     *
     * The returned callback is a bound version of `.on_disconnected_callback`,
     * which may be overridden in a subclass to change behaviour.
     * */
    get_on_disconnected_callback(): OnDisconnectedCallback {
        return this.on_disconnected_callback.bind(this)
    }

    /** Passed to a `SlotWithFunction`'s `.connect` method.
     * In that call to `.connect`, this here method gets called and we get
     * passed the `slot` and `signal` we're supposed to
     * disconnect later, and (via this here method's return value) we provide
     * the `SlotWithFunction` with the function it'll call when that signal
     * gets disconnected on its end, so we know we can stop tracking it (
     * since it's already disconnected).
     *
     * Override in subclass to change behaviour.
     */
    protected on_connected_callback(
        slot: SlotWithFunction<any>,
        signal: Signal<any>
    ): OnDisconnectedCallback {
        this.connected_slot_signal_pairs.set(slot, signal)
        return this.get_on_disconnected_callback()
    }

    /** Called by a `SlotWithFunction` we gave this method to when its signal,
     * which we're also tracking so we can later disconnect it, is disconnected
     * on its end. This here contains the code that needs to run so we stop
     * tracking that already disconnected signal connection.
     *
     * Override in subclass to change behaviour.
     * */
    protected on_disconnected_callback(
        slot: SlotWithFunction<any>,
        _signal: Signal<any>
    ) {
        this.connected_slot_signal_pairs.delete_by_a(slot)
    }
}


export {
    Slot,
    Disconnecter
}
