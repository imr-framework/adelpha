# Low-field acquisition suite for Adelpha.
# Usage: julia --project=koma --threads=auto koma/run_suite.jl low-field <params.json> <result.json>

using KomaMRI
using KomaMRI.PulseDesigner
using Random

const FOV_M = 0.22
const N_MIN = 20
const N_MAX = 28
const ECHO_TRAIN = 4
const RF_S = 0.8e-3
const PRE_S = 1.2e-3

const NAMES = Dict(
    "gre" => "Spoiled gradient echo",
    "se" => "Spin echo",
    "fse" => "Fast spin echo",
    "bssfp" => "Balanced SSFP",
)

function json_string(value::AbstractString)
    escaped = replace(value, '\\' => "\\\\", '"' => "\\\"", '\n' => "\\n", '\r' => "\\r", '\t' => "\\t")
    return "\"$(escaped)\""
end

function json_number(value)
    number = Float64(value)
    return isfinite(number) ? string(number) : "null"
end

function json_array(values)
    return "[" * join((json_number(value) for value in values), ",") * "]"
end

function write_result(path, body)
    open(path, "w") do io
        write(io, body)
    end
end

function fail(path, message)
    write_result(path, "{\"ok\":false,\"error\":$(json_string(message))}")
end

function parse_params(text::AbstractString)
    body = strip(text)
    (startswith(body, "{") && endswith(body, "}")) || error("Simulation settings are not an object.")
    out = Dict{String, String}()
    inner = strip(body[2:end-1])
    isempty(inner) && return out
    for part in split(inner, ",")
        piece = strip(part)
        isempty(piece) && continue
        key, value = split(piece, ":"; limit=2)
        out[strip(key, [' ', '"'])] = strip(value, [' ', '"'])
    end
    return out
end

function number_param(params, key, default)
    value = parse(Float64, get(params, key, string(default)))
    isfinite(value) || error("$key is not a finite number.")
    return value
end

function clamp_request(params)
    sequence = get(params, "sequence", "se")
    haskey(NAMES, sequence) || error("Unknown sequence: $sequence")
    b0 = clamp(number_param(params, "b0_t", 0.5), 0.05, 1.0)
    ppm = clamp(number_param(params, "inhomogeneity_ppm", 20), 0, 80)
    gmax = clamp(number_param(params, "gmax_mt_m", 15), 5, 40) * 1e-3
    tr = clamp(number_param(params, "tr_ms", 80), 4, 400) * 1e-3
    te = clamp(number_param(params, "te_ms", 16), 1, 200) * 1e-3
    flip = clamp(number_param(params, "flip_deg", 90), 5, 180)
    averages = clamp(round(Int, number_param(params, "averages", 1)), 1, 8)
    voxel = clamp(number_param(params, "voxel_mm", 8), 6, 12)
    bandwidth = clamp(number_param(params, "bandwidth_hz", 160), 40, 400)
    n = clamp(round(Int, (FOV_M * 1e3) / voxel), N_MIN, N_MAX)
    te = min(te, tr)
    sequence == "bssfp" && (te = tr / 2)
    return (;
        sequence, b0, ppm, gmax, tr, te, flip, averages, voxel, bandwidth, n,
        voxel_mm = (FOV_M * 1e3) / n,
    )
end

function low_field_scanner(request)
    Scanner(limits=HardwareLimits(;
        B0=request.b0,
        B1=15e-6,
        Gmax=request.gmax,
        Smax=80.0,
    ))
end

function relax_for_field!(obj, b0)
    ratio = b0 / 1.5
    obj.T1 .= max.(0.08, obj.T1 .* ratio^0.4)
    r2 = 1 ./ max.(obj.T2, 1e-3)
    r2s = 1 ./ max.(obj.T2s, 1e-3)
    obj.T2s .= 1 ./ (r2 .+ max.(r2s .- r2, 0) .* ratio)
    obj.Δw .*= ratio
    return obj
end

function inhomogeneity(x, ppm, b0)
    ppm <= 0 && return zeros(length(x))
    half = 2π * (ppm * 1e-6) * γ * b0 / 2
    xmax = max(maximum(abs.(x)), 1e-6)
    reduced = x ./ xmax
    return half .* reduced .+ (0.35 * half) .* reduced .^ 2
end

function phantom_with_field(base, ppm, b0)
    obj = deepcopy(base)
    obj.Δw = obj.Δw .+ inhomogeneity(obj.x, ppm, b0)
    return obj
end

function append_delay!(seq, seconds)
    gap = round_to_raster(seconds, 1e-5)
    gap < 2e-5 && return 0.0
    @addblock seq += Delay(gap)
    return gap
end

function readout_events(sys, n, bandwidth)
    flat = 1 / bandwidth
    gx = make_trapezoid(; flat_area=n / FOV_M, flat_time=flat, sys)
    adc = make_adc(n; duration=gx.T, delay=gx.rise, sys)
    gx_pre = make_trapezoid(; area=-γ * area(gx) / 2, duration=PRE_S, sys)
    gy = make_trapezoid(; area=(n / 2) / FOV_M, duration=PRE_S, sys)
    return gx, adc, gx_pre, gy
end

function phase_scale(line, n)
    return (line / (n - 1)) * 2 - 1
end

function finish_sequence!(seq, request)
    seq.DEF["Nx"] = request.n
    seq.DEF["Ny"] = request.n
    seq.DEF["Nz"] = 1
    seq.DEF["FOV"] = [FOV_M, FOV_M, request.voxel_mm * 1e-3]
    seq.DEF["Name"] = request.sequence
    return seq
end

function build_gre(sys, request)
    rf = make_block_pulse(deg2rad(request.flip); duration=RF_S, sys, use=Excitation())
    gx, adc, gx_pre, gy = readout_events(sys, request.n, request.bandwidth)
    spoil = make_trapezoid(; area=n_area(request.n), duration=1e-3, sys)
    echo_at = gx.delay + gx.rise + gx.T / 2
    min_te = dur(rf, sys) / 2 + dur(gx_pre) + echo_at
    request.te + 1e-4 < min_te &&
        error("TE is shorter than this readout. Raise TE or raise the bandwidth.")
    seq = Sequence(sys)
    for line in 0:(request.n - 1)
        @addblock seq += (rf,)
        @addblock seq += (x=gx_pre, y=phase_scale(line, request.n) * gy)
        gap = append_delay!(seq, request.te - min_te)
        @addblock seq += (x=gx, adc)
        @addblock seq += (x=spoil,)
        used = dur(rf, sys) + dur(gx_pre) + gap + dur(gx) + dur(spoil)
        request.tr + 1e-4 < used && error("TR is shorter than one line. Raise TR.")
        append_delay!(seq, request.tr - used)
    end
    return finish_sequence!(seq, request)
end

function n_area(n)
    return n / FOV_M
end

function build_se(sys, request)
    rf90 = make_block_pulse(deg2rad(request.flip); duration=RF_S, sys, use=Excitation())
    rf180 = make_block_pulse(π; duration=RF_S, sys, use=Refocusing())
    gx, adc, gx_pre, gy = readout_events(sys, request.n, request.bandwidth)
    echo_at = gx.delay + gx.rise + gx.T / 2
    to_refocus = request.te / 2 - dur(rf90, sys) / 2 - dur(rf180, sys) / 2
    to_echo = request.te / 2 - dur(rf180, sys) / 2 - dur(gx_pre) - echo_at
    (to_refocus < -1e-4 || to_echo < -1e-4) &&
        error("TE is shorter than the spin echo allows. Raise TE or raise the bandwidth.")
    line_body = dur(rf90, sys) + max(to_refocus, 0) + dur(rf180, sys) + max(to_echo, 0) + dur(gx_pre) + dur(gx)
    request.tr + 1e-4 < line_body && error("TR is shorter than one line. Raise TR.")
    seq = Sequence(sys)
    for line in 0:(request.n - 1)
        @addblock seq += (rf90,)
        append_delay!(seq, to_refocus)
        @addblock seq += (rf180,)
        append_delay!(seq, to_echo)
        @addblock seq += (x=gx_pre, y=phase_scale(line, request.n) * gy)
        @addblock seq += (x=gx, adc)
        append_delay!(seq, request.tr - line_body)
    end
    return finish_sequence!(seq, request)
end

function build_fse(sys, request)
    rf90 = make_block_pulse(deg2rad(request.flip); duration=RF_S, sys, use=Excitation())
    rf180 = make_block_pulse(π; duration=RF_S, sys, use=Refocusing())
    gx, adc, gx_pre, gy = readout_events(sys, request.n, request.bandwidth)
    echo_at = gx.delay + gx.rise + gx.T / 2
    spacing = request.te
    half = spacing / 2
    to_first = half - dur(rf90, sys) / 2 - dur(rf180, sys) / 2
    between = half - dur(rf180, sys) / 2 - dur(gx_pre) - echo_at
    after = half - (dur(gx) - echo_at) - dur(gx_pre) - dur(rf180, sys) / 2
    (to_first < -1e-4 || between < -1e-4 || after < -1e-4) &&
        error("Echo spacing is shorter than the train allows. Raise TE or raise the bandwidth.")
    shots = cld(request.n, ECHO_TRAIN)
    train = dur(rf90, sys) + max(to_first, 0) +
        ECHO_TRAIN * (dur(rf180, sys) + max(between, 0) + 2 * dur(gx_pre) + dur(gx)) +
        (ECHO_TRAIN - 1) * after
    request.tr + 1e-4 < train && error("TR is shorter than the echo train. Raise TR.")
    seq = Sequence(sys)
    for shot in 0:(shots - 1)
        @addblock seq += (rf90,)
        append_delay!(seq, to_first)
        for echo in 0:(ECHO_TRAIN - 1)
            line = shot + echo * shots
            line >= request.n && break
            echo == 0 || append_delay!(seq, max(after, 0))
            @addblock seq += (rf180,)
            append_delay!(seq, between)
            scale = phase_scale(min(line, request.n - 1), request.n)
            if line < request.n
                @addblock seq += (x=gx_pre, y=scale * gy)
                @addblock seq += (x=gx, adc)
                @addblock seq += (x=gx_pre, y=-scale * gy)
            end
        end
        append_delay!(seq, request.tr - train)
    end
    return finish_sequence!(seq, request)
end

function build_bssfp(sys, request)
    rf0 = make_block_pulse(deg2rad(request.flip); duration=RF_S, sys, use=Excitation(), phase_offset=0.0)
    rf180 = make_block_pulse(deg2rad(request.flip); duration=RF_S, sys, use=Excitation(), phase_offset=π)
    gx, adc, gx_pre, gy = readout_events(sys, request.n, request.bandwidth)
    echo_at = gx.delay + gx.rise + gx.T / 2
    min_half = dur(rf0, sys) / 2 + dur(gx_pre) + echo_at
    tail = dur(gx) - echo_at + dur(gx_pre) + dur(rf0, sys) / 2
    (request.tr / 2 + 1e-4 < min_half || request.tr / 2 + 1e-4 < tail) &&
        error("TR is shorter than the balanced readout. Raise TR or raise the bandwidth.")
    gap_before = request.tr / 2 - min_half
    gap_after = request.tr / 2 - tail
    seq = Sequence(sys)
    for line in 0:(request.n - 1)
        rf = iseven(line) ? rf0 : rf180
        scale = phase_scale(line, request.n)
        @addblock seq += (rf,)
        @addblock seq += (x=gx_pre, y=scale * gy)
        append_delay!(seq, gap_before)
        @addblock seq += (x=gx, adc)
        @addblock seq += (x=gx_pre, y=-scale * gy)
        append_delay!(seq, gap_after)
    end
    return finish_sequence!(seq, request)
end

function build_sequence(sys, request)
    request.sequence == "gre" && return build_gre(sys, request)
    request.sequence == "se" && return build_se(sys, request)
    request.sequence == "fse" && return build_fse(sys, request)
    return build_bssfp(sys, request)
end

function shots_for(request)
    return request.sequence == "fse" ? cld(request.n, ECHO_TRAIN) : request.n
end

function center_echo(raw::RawAcquisitionData)
    profiles = raw.profiles
    isempty(profiles) && return Float64[]
    profile = profiles[cld(length(profiles), 2)]
    column = size(profile.data, 2) >= 1 ? profile.data[:, 1] : vec(profile.data)
    return Float64.(abs.(column))
end

function fftshift2(values)
    return circshift(values, (size(values, 1) ÷ 2, size(values, 2) ÷ 2))
end

function ifftshift2(values)
    return circshift(values, (-(size(values, 1) ÷ 2), -(size(values, 2) ÷ 2)))
end

function ifft2(kspace)
    nx, ny = size(kspace)
    along_x = [cis(2π * (x - 1) * (kx - 1) / nx) / nx for x in 1:nx, kx in 1:nx]
    along_y = [cis(2π * (y - 1) * (ky - 1) / ny) / ny for ky in 1:ny, y in 1:ny]
    return along_x * kspace * along_y
end

function reconstruct_complex(raw::RawAcquisitionData)
    profiles = raw.profiles
    isempty(profiles) && error("The simulation returned no signal.")
    nx = size(profiles[1].data, 1)
    ny = length(profiles)
    kspace = zeros(ComplexF64, nx, ny)
    for (line, profile) in enumerate(profiles)
        column = size(profile.data, 2) >= 1 ? profile.data[:, 1] : vec(profile.data)
        copyto!(view(kspace, :, line), ComplexF64.(column))
    end
    return fftshift2(ifft2(ifftshift2(kspace)))
end

function image_payload(image, peak)
    image === nothing && return "null"
    nx, ny = size(image)
    scale = peak > 0 ? 1 / peak : 1.0
    values = Float64[]
    sizehint!(values, nx * ny)
    for y in 1:ny
        for x in 1:nx
            push!(values, abs(image[x, y]) * scale)
        end
    end
    return "{\"width\":$(nx),\"height\":$(ny),\"values\":$(json_array(values))}"
end

function snr_for(request)
    return 12.0 * (request.b0 / 0.5) * (request.voxel_mm / 8)^3 * sqrt(request.averages) * sqrt(160 / request.bandwidth)
end

function signal_level(image)
    magnitudes = abs.(vec(image))
    peak = maximum(magnitudes)
    peak <= 0 && return 0.0
    tissue = magnitudes[magnitudes .> 0.05 * peak]
    isempty(tissue) && return peak
    sorted = sort(tissue)
    return sorted[cld(length(sorted), 2)]
end

function add_noise(image, snr)
    sigma = signal_level(image) / max(snr, 1e-3)
    return image .+ (sigma / sqrt(2)) .* (randn(size(image)) .+ 1im .* randn(size(image)))
end

function simulate_once(obj, seq, sys, sim_params)
    raw = simulate(obj, seq, sys; sim_params)
    image = reconstruct_complex(raw)
    return raw, image
end

function friendly(err)
    message = sprint(showerror, err)
    if occursin("Gmax", message) || occursin("slew", message) || occursin("exceeds", message)
        return "The readout needs more gradient than this scanner allows. Lower the bandwidth or raise the peak gradient."
    end
    return message
end

function run_low_field(params_path)
    request = clamp_request(parse_params(read(params_path, String)))
    sys = low_field_scanner(request)
    base = brain_phantom2D(; ss=4)
    relax_for_field!(base, request.b0)
    seq = build_sequence(sys, request)
    sim_params = KomaMRICore.default_sim_params()
    sim_params["gpu"] = false
    sim_params["Nthreads"] = max(1, Sys.CPU_THREADS)
    sim_params["Δt"] = 0.002
    started = time()
    raw, uniform = simulate_once(base, seq, sys, sim_params)
    contrasted = request.ppm > 0 ? simulate_once(phantom_with_field(base, request.ppm, request.b0), seq, sys, sim_params)[2] : uniform
    elapsed = time() - started
    snr = snr_for(request)
    Random.seed!(1)
    noisy = add_noise(uniform, snr)
    peak = max(maximum(abs.(uniform)), 1e-12)
    scan = request.tr * shots_for(request) * request.averages
    return """
    {"ok":true,"suite":"low-field","title":$(json_string(NAMES[request.sequence])),"summary":"Low-field Bloch simulation of one brain slice.","phantom":$(json_string(String(base.name))),"spins":$(length(base.x)),"profiles":$(length(raw.profiles)),"samples_per_profile":$(isempty(raw.profiles) ? 0 : size(raw.profiles[1].data, 1)),"scanner_b0_t":$(json_number(request.b0)),"gmax_mt_m":$(json_number(request.gmax * 1e3)),"inhomogeneity_ppm":$(json_number(request.ppm)),"sequence":$(json_string(NAMES[request.sequence])),"sequence_id":$(json_string(request.sequence)),"tr_ms":$(json_number(request.tr * 1e3)),"te_ms":$(json_number(request.te * 1e3)),"flip_deg":$(json_number(request.flip)),"averages":$(request.averages),"voxel_mm":$(json_number(request.voxel_mm)),"fov_mm":$(json_number(FOV_M * 1e3)),"matrix":$(request.n),"bandwidth_hz":$(json_number(request.bandwidth)),"scan_time_s":$(json_number(scan)),"snr":$(json_number(snr)),"elapsed_s":$(json_number(elapsed)),"echo":$(json_array(center_echo(raw))),"image":$(image_payload(uniform, peak)),"noisy_image":$(image_payload(noisy, peak)),"inhomogeneous_image":$(image_payload(contrasted, peak)),"reconstruction_error":""}
    """
end

function main()
    length(ARGS) == 3 || error("usage: run_suite.jl low-field <params.json> <result.json>")
    suite, params_path, path = ARGS
    try
        suite == "low-field" || error("Unknown suite: $suite")
        write_result(path, run_low_field(params_path))
    catch err
        fail(path, friendly(err))
        rethrow()
    end
end

main()
