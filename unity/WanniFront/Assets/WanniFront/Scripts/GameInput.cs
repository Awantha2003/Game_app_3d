using UnityEngine;
#if ENABLE_INPUT_SYSTEM && !ENABLE_LEGACY_INPUT_MANAGER
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
#endif

namespace WanniFront
{
    /// <summary>
    /// Thin input wrapper that works with both the legacy Input Manager and the
    /// new Input System package, whichever the project has enabled.
    /// </summary>
    public static class GameInput
    {
        public static float MouseSensitivity = 2.0f;

#if ENABLE_INPUT_SYSTEM && !ENABLE_LEGACY_INPUT_MANAGER
        static Keyboard K => Keyboard.current;
        static Mouse M => Mouse.current;

        static KeyControl Map(KeyCode k)
        {
            if (K == null) return null;
            switch (k)
            {
                case KeyCode.W: return K.wKey;
                case KeyCode.A: return K.aKey;
                case KeyCode.S: return K.sKey;
                case KeyCode.D: return K.dKey;
                case KeyCode.C: return K.cKey;
                case KeyCode.Z: return K.zKey;
                case KeyCode.R: return K.rKey;
                case KeyCode.E: return K.eKey;
                case KeyCode.G: return K.gKey;
                case KeyCode.H: return K.hKey;
                case KeyCode.B: return K.bKey;
                case KeyCode.M: return K.mKey;
                case KeyCode.P: return K.pKey;
                case KeyCode.Space: return K.spaceKey;
                case KeyCode.LeftShift: return K.leftShiftKey;
                case KeyCode.LeftControl: return K.leftCtrlKey;
                case KeyCode.Escape: return K.escapeKey;
                case KeyCode.Return: return K.enterKey;
                case KeyCode.Tab: return K.tabKey;
                case KeyCode.Alpha1: return K.digit1Key;
                case KeyCode.Alpha2: return K.digit2Key;
                case KeyCode.Alpha3: return K.digit3Key;
                case KeyCode.Alpha4: return K.digit4Key;
                default: return null;
            }
        }

        public static bool Key(KeyCode k) { var c = Map(k); return c != null && c.isPressed; }
        public static bool KeyDown(KeyCode k) { var c = Map(k); return c != null && c.wasPressedThisFrame; }
        public static Vector2 Look => M != null ? M.delta.ReadValue() * 0.05f * MouseSensitivity : Vector2.zero;
        public static bool Fire => M != null && M.leftButton.isPressed;
        public static bool FireDown => M != null && M.leftButton.wasPressedThisFrame;
        public static bool Aim => M != null && M.rightButton.isPressed;
        public static float Scroll => M != null ? Mathf.Sign(M.scroll.ReadValue().y) * (Mathf.Abs(M.scroll.ReadValue().y) > 0.01f ? 1f : 0f) : 0f;
#else
        public static bool Key(KeyCode k) => Input.GetKey(k);
        public static bool KeyDown(KeyCode k) => Input.GetKeyDown(k);
        public static Vector2 Look => new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y")) * MouseSensitivity;
        public static bool Fire => Input.GetMouseButton(0);
        public static bool FireDown => Input.GetMouseButtonDown(0);
        public static bool Aim => Input.GetMouseButton(1);
        public static float Scroll => Input.GetAxisRaw("Mouse ScrollWheel") > 0 ? 1f : Input.GetAxisRaw("Mouse ScrollWheel") < 0 ? -1f : 0f;
#endif

        public static Vector2 Move
        {
            get
            {
                float x = 0, y = 0;
                if (Key(KeyCode.W)) y += 1;
                if (Key(KeyCode.S)) y -= 1;
                if (Key(KeyCode.A)) x -= 1;
                if (Key(KeyCode.D)) x += 1;
                return new Vector2(x, y);
            }
        }
    }
}
