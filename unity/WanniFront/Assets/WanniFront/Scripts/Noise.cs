using UnityEngine;

namespace WanniFront
{
    /// <summary>Deterministic value noise used for terrain shapes and painting.</summary>
    public static class Noise
    {
        static float Hash(int x, int z)
        {
            unchecked
            {
                int h = x * 374761393 + z * 668265263;
                h = (h ^ (int)((uint)h >> 13)) * 1274126177;
                return (uint)(h ^ (int)((uint)h >> 16)) / 4294967295f;
            }
        }

        public static float Value(float x, float z)
        {
            int xi = Mathf.FloorToInt(x), zi = Mathf.FloorToInt(z);
            float fx = x - xi, fz = z - zi;
            fx = fx * fx * (3 - 2 * fx);
            fz = fz * fz * (3 - 2 * fz);
            float a = Hash(xi, zi), b = Hash(xi + 1, zi), c = Hash(xi, zi + 1), d = Hash(xi + 1, zi + 1);
            return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
        }

        public static float Fbm(float x, float z, int octaves = 4)
        {
            float sum = 0, amp = 1, norm = 0;
            for (int i = 0; i < octaves; i++)
            {
                sum += Value(x, z) * amp;
                norm += amp;
                amp *= 0.5f;
                x *= 2.03f;
                z *= 2.03f;
            }
            return sum / norm;
        }

        public static float Smooth(float e0, float e1, float x)
        {
            float t = Mathf.Clamp01((x - e0) / (e1 - e0));
            return t * t * (3 - 2 * t);
        }
    }
}
