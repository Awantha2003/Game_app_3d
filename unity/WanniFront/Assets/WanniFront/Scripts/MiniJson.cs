using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace WanniFront
{
    /// <summary>
    /// Minimal JSON reader (objects, arrays, strings, numbers, bools, null).
    /// Used for materials.json written by the Blender script.
    /// </summary>
    public static class MiniJson
    {
        public static object Parse(string json)
        {
            int i = 0;
            return ParseValue(json, ref i);
        }

        static void Skip(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
        }

        static object ParseValue(string s, ref int i)
        {
            Skip(s, ref i);
            char c = s[i];
            if (c == '{') return ParseObject(s, ref i);
            if (c == '[') return ParseArray(s, ref i);
            if (c == '"') return ParseString(s, ref i);
            if (s.Substring(i).StartsWith("true")) { i += 4; return true; }
            if (s.Substring(i).StartsWith("false")) { i += 5; return false; }
            if (s.Substring(i).StartsWith("null")) { i += 4; return null; }
            int start = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            return double.Parse(s.Substring(start, i - start), CultureInfo.InvariantCulture);
        }

        static Dictionary<string, object> ParseObject(string s, ref int i)
        {
            var d = new Dictionary<string, object>();
            i++;
            Skip(s, ref i);
            if (s[i] == '}') { i++; return d; }
            while (true)
            {
                Skip(s, ref i);
                string key = ParseString(s, ref i);
                Skip(s, ref i);
                i++; // ':'
                d[key] = ParseValue(s, ref i);
                Skip(s, ref i);
                if (s[i] == ',') { i++; continue; }
                i++; // '}'
                return d;
            }
        }

        static List<object> ParseArray(string s, ref int i)
        {
            var list = new List<object>();
            i++;
            Skip(s, ref i);
            if (s[i] == ']') { i++; return list; }
            while (true)
            {
                list.Add(ParseValue(s, ref i));
                Skip(s, ref i);
                if (s[i] == ',') { i++; continue; }
                i++;
                return list;
            }
        }

        static string ParseString(string s, ref int i)
        {
            var sb = new StringBuilder();
            i++;
            while (s[i] != '"')
            {
                if (s[i] == '\\')
                {
                    i++;
                    char e = s[i];
                    if (e == 'n') sb.Append('\n');
                    else if (e == 't') sb.Append('\t');
                    else if (e == 'u') { sb.Append((char)int.Parse(s.Substring(i + 1, 4), NumberStyles.HexNumber)); i += 4; }
                    else sb.Append(e);
                }
                else sb.Append(s[i]);
                i++;
            }
            i++;
            return sb.ToString();
        }
    }
}
