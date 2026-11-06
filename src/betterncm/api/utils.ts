export namespace utils {
  export function waitForFunction<T>(func: () => T, interval = 100): Promise<NonNullable<T>> {
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        try {
          const value = func();
          if (value) {
            clearInterval(timer);
            resolve(value as NonNullable<T>);
          }
        } catch (error) {
          clearInterval(timer);
          reject(error);
        }
      }, interval);
    });
  }
  export function waitForElement<E extends Element = Element>(
    selector: string,
    interval = 100
  ): Promise<E> {
    return waitForFunction(() => document.querySelector<E>(selector), interval);
  }
  export function debounce<T extends (...args: any[]) => any>(callback: T, waitTime: number): T {
    let timer: ReturnType<typeof setTimeout>;
    return function (this: unknown, ...args: Parameters<T>) {
      clearTimeout(timer);
      timer = setTimeout(() => callback.apply(this, args), waitTime);
    } as T;
  }
  export function delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
  export function dom(tag: string, settings: Record<string, any> = {}, ...children: any[]) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(settings)) {
      if (value == null) continue;
      if (key === "class") {
        for (const cls of Array.isArray(value) ? value : String(value).split(/\s+/))
          if (cls) element.classList.add(cls);
      } else if (key === "style" && typeof value === "object") {
        for (const [name, style] of Object.entries(value))
          if (name.startsWith("--")) element.style.setProperty(name, String(style));
          else (element.style as any)[name] = style;
      } else if (key === "style") element.style.cssText = String(value);
      else if (key === "for") element.setAttribute("for", String(value));
      else if (key.startsWith("data-") || key.startsWith("aria-"))
        element.setAttribute(key, String(value));
      else (element as any)[key] = value;
    }
    for (const child of children.flat())
      if (child != null && child !== false)
        element.append(child instanceof Node ? child : String(child));
    return element;
  }
}
